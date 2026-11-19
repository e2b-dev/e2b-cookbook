"""The small coding task and its independent checks; no host-file tools."""

import hashlib
import os
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv
from e2b import AsyncSandbox, SandboxQuery, SandboxState
from openai import AsyncOpenAI
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import UsageLimits
from pydantic_ai.workspaces import Workspace
from pydantic_ai_harness.e2b_sandbox import E2BSandbox
from pydantic_ai_harness.filesystem import FileSystem
from pydantic_ai_harness.shell import Shell

FIXTURE = Path(__file__).parent / "fixture_repo"
WORKDIR = "/home/user/log-cli"
ENV = {"PYTHONDONTWRITEBYTECODE": "1"}
TESTS = ["python", "-m", "unittest", "-v"]
DIAGNOSE = """Read log_stats.py, test_log_stats.py, and requests.jsonl. Run
python -m unittest -v to reproduce the failures. Write diagnosis.md explaining
the root causes and the proposed fix. Do not modify the code, tests, or input
logs yet. Stop after saving the diagnosis."""
FIX = """Read the saved diagnosis.md and fix log_stats.py. Server errors are
HTTP statuses 500 through 599. p95 uses nearest rank: ceil(0.95 * count),
with one-based ranks. Do not modify the tests or requests.jsonl. Run
python -m unittest -v, then python log_stats.py requests.jsonl. Reply with a
short explanation of the fix."""


def configure() -> None:
    load_dotenv(Path(__file__).parent / ".env")
    missing = [key for key in ("E2B_API_KEY", "OPENAI_API_KEY") if not os.getenv(key)]
    if missing:
        raise RuntimeError(f"Missing environment variables: {', '.join(missing)}")


def make_agent(*extra_capabilities) -> Agent:
    configure()
    model = OpenAIChatModel(
        os.getenv("MODEL", "gpt-4.1-mini"),
        provider=OpenAIProvider(openai_client=AsyncOpenAI(max_retries=0, timeout=30)),
    )
    return Agent(
        model,
        name="log_cli_fixer",
        instructions="Work only in this sandbox project. Use the supplied tools; verify claims by running tests.",
        model_settings={"max_tokens": 1536, "parallel_tool_calls": False},
        capabilities=[
            E2BSandbox(
                working_dir=WORKDIR,
                env=ENV,
                sandbox_timeout=600,
                allow_internet_access=False,
            ),
            Shell(tools=["run_command"], default_timeout=20, max_output_chars=6000),
            FileSystem(
                tools=["read_file", "write_file", "edit_file"], content_hashes=False
            ),
            *extra_capabilities,
        ],
    )


def limits() -> UsageLimits:
    return UsageLimits(
        request_limit=8,
        input_tokens_limit=60_000,
        output_tokens_limit=12_000,
        cost_limit=Decimal("0.10"),
    )


async def seed(workspace: Workspace) -> None:
    for name in ("log_stats.py", "test_log_stats.py", "requests.jsonl"):
        await workspace.write_bytes(name, (FIXTURE / name).read_bytes())
    before = await workspace.run(TESTS, timeout=20)
    if before.exit_code == 0:
        raise AssertionError("The fixture must fail before the agent fixes it")
    await workspace.write_text("before-tests.txt", before.stdout + before.stderr)


async def fingerprints(workspace: Workspace) -> dict[str, str]:
    return {
        name: hashlib.sha256(await workspace.read_bytes(name)).hexdigest()
        for name in (
            "log_stats.py",
            "requests.jsonl",
            "diagnosis.md",
            "before-tests.txt",
        )
    }


async def verify(workspace: Workspace) -> str:
    # Shell can bypass FileSystem's read-only patterns, so restore trusted tests.
    await workspace.write_bytes(
        "test_log_stats.py", (FIXTURE / "test_log_stats.py").read_bytes()
    )
    if (
        await workspace.read_bytes("requests.jsonl")
        != (FIXTURE / "requests.jsonl").read_bytes()
    ):
        raise AssertionError("The agent changed the input logs")
    result = await workspace.run(TESTS, timeout=20)
    output = result.stdout + result.stderr
    print(output, flush=True)
    if result.exit_code != 0:
        raise AssertionError("Independent regression tests failed")
    cli = await workspace.run(["python", "log_stats.py", "requests.jsonl"], timeout=20)
    if cli.exit_code != 0:
        raise AssertionError(f"CLI failed: {cli.stderr}")
    await workspace.write_text("after-tests.txt", output)
    return cli.stdout.strip()


async def sandbox_ids() -> set[str]:
    paginator = AsyncSandbox.list(
        query=SandboxQuery(state=[SandboxState.RUNNING, SandboxState.PAUSED])
    )
    ids = set()
    while paginator.has_next:
        ids.update(item.sandbox_id for item in await paginator.next_items())
    return ids
