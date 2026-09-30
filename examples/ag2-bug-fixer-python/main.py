"""AG2 bug-fixer agent that runs and fixes a failing test suite in an E2B sandbox."""

import asyncio
import os
import sys
from pathlib import Path, PurePosixPath

from ag2 import Agent
from ag2.config import OpenAIResponsesConfig
from ag2.extensions.e2b import E2BEnvironment
from ag2.tools import SandboxCodeTool, SandboxShellTool
from ag2.tools.sandbox import ExecResult, SandboxFactory
from dotenv import load_dotenv

DEFAULT_MODEL = "gpt-5.6-luna"
FIXTURE_DIR = Path(__file__).parent / "fixture_repo"
WORKDIR = "/home/user/repo"
TEST_COMMAND = ["python", "-m", "unittest", "-v"]
# Idle lifetime; every tool call extends it while the agent works.
SANDBOX_TIMEOUT_SECONDS = 600
# An in-place edit that keeps a file's size and mtime second would otherwise be
# shadowed by a stale .pyc, and the agent would see its fix "not work".
ENV_VARS = {"PYTHONDONTWRITEBYTECODE": "1"}

INSTRUCTIONS = """\
You are a careful software engineer working in a Python repository.
Use the shell tool to inspect files and run commands, and the code tool to try
out snippets. Run the tests with `python -m unittest -v`.

Fix the bug in the source code so that every test passes. Do not edit the
tests. After each change, run the tests again. When they pass, reply with a
short summary of the root cause and the fix.
"""

TASK = "The test suite in this repository fails. Find the bug and fix it."


def require_environment() -> None:
    missing = [
        name for name in ("E2B_API_KEY", "OPENAI_API_KEY") if not os.getenv(name)
    ]
    if missing:
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}. "
            "Copy .env.template to .env and add your API keys."
        )


async def upload_repository(env: SandboxFactory, source: Path = FIXTURE_DIR) -> None:
    """Copy the local repository into the sandbox workdir."""
    async with env.open() as sandbox:
        for path in sorted(source.rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                await sandbox.put_file(
                    PurePosixPath(path.relative_to(source).as_posix()),
                    path.read_bytes(),
                )


async def run_tests(env: SandboxFactory) -> ExecResult:
    async with env.open() as sandbox:
        return await sandbox.exec(TEST_COMMAND)


def build_agent(env: SandboxFactory, config: OpenAIResponsesConfig) -> Agent:
    # Both tools share one sandbox: files the shell edits are visible to the code tool.
    return Agent(
        "bug_fixer",
        prompt=INSTRUCTIONS,
        config=config,
        tools=[SandboxShellTool(env), SandboxCodeTool(env)],
    )


async def fix_bug(
    env: SandboxFactory, config: OpenAIResponsesConfig
) -> tuple[str, ExecResult]:
    """Let the agent fix the repository, then verify the result independently."""
    await upload_repository(env)
    reply = await build_agent(env, config).ask(TASK)
    return reply.body or "", await run_tests(env)


async def main() -> int:
    load_dotenv()
    require_environment()
    config = OpenAIResponsesConfig(model=os.getenv("MODEL", DEFAULT_MODEL))

    async with E2BEnvironment(
        workdir=WORKDIR,
        env_vars=ENV_VARS,
        sandbox_timeout=SANDBOX_TIMEOUT_SECONDS,
    ) as env:
        summary, result = await fix_bug(env, config)

    print(f"Agent summary:\n{summary}\n")
    print(f"Independent test run (exit code {result.exit_code}):\n{result.output}")
    return result.exit_code


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
