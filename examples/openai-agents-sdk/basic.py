from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Literal

from openai.types.responses import ResponseTextDeltaEvent

from agents import ModelSettings, Runner
from agents.run import RunConfig
from agents.sandbox import SandboxAgent, SandboxRunConfig

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from examples.sandbox.misc.example_support import text_manifest
from examples.sandbox.misc.workspace_shell import WorkspaceShellCapability

try:
    from agents.extensions.sandbox import (
        E2BSandboxClient,
        E2BSandboxClientOptions,
        E2BSandboxType,
    )
except Exception as exc:  # pragma: no cover - import path depends on optional extras
    raise SystemExit(
        "E2B sandbox examples require the optional repo extra.\n"
        "Install it with: uv sync --extra e2b"
    ) from exc


DEFAULT_QUESTION = "Summarize this workspace in 2 short sentences."
DEFAULT_MODEL = "gpt-5.6-terra"
DEFAULT_SANDBOX_TYPE = E2BSandboxType.E2B.value


def _require_env(name: str) -> None:
    if os.environ.get(name):
        return
    raise SystemExit(f"{name} must be set before running this example.")


def _build_agent(*, model: str) -> SandboxAgent:
    return SandboxAgent(
        name="E2B Workspace Assistant",
        model=model,
        instructions=(
            "Answer questions about the sandbox workspace. Inspect the files before answering "
            "and keep the response concise."
        ),
        developer_instructions=(
            "Do not guess about files you did not inspect. Mention the file names you read."
        ),
        default_manifest=text_manifest(
            {
                "README.md": (
                    "# Demo Workspace\n\n"
                    "This is a tiny E2B sandbox workspace for a basic agent example.\n"
                ),
                "plan.txt": (
                    "1. Inspect the workspace.\n"
                    "2. Summarize what this project contains.\n"
                    "3. Keep the answer short.\n"
                ),
                "src/greet.py": ('def greet(name: str) -> str:\n    return f"Hello, {name}!"\n'),
            }
        ),
        capabilities=[WorkspaceShellCapability()],
        model_settings=ModelSettings(tool_choice="required"),
    )


async def main(
    *,
    model: str,
    question: str,
    sandbox_type: Literal["e2b_code_interpreter", "e2b"],
    template: str | None,
    timeout: int | None,
    stream: bool,
) -> None:
    _require_env("OPENAI_API_KEY")
    _require_env("E2B_API_KEY")

    agent = _build_agent(model=model)
    run_config = RunConfig(
        sandbox=SandboxRunConfig(
            client=E2BSandboxClient(),
            options=E2BSandboxClientOptions(
                sandbox_type=E2BSandboxType(sandbox_type),
                template=template,
                timeout=timeout,
                pause_on_exit=True,
            ),
        ),
        workflow_name="Basic E2B sandbox example",
    )

    if not stream:
        result = await Runner.run(agent, question, run_config=run_config)
        print(result.final_output)
        return

    stream_result = Runner.run_streamed(agent, question, run_config=run_config)
    saw_text_delta = False

    async for event in stream_result.stream_events():
        if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
            if not saw_text_delta:
                print("assistant> ", end="", flush=True)
                saw_text_delta = True
            print(event.data.delta, end="", flush=True)

    if saw_text_delta:
        print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Model name to use.")
    parser.add_argument("--question", default=DEFAULT_QUESTION, help="Prompt to send to the agent.")
    parser.add_argument(
        "--sandbox-type",
        default=DEFAULT_SANDBOX_TYPE,
        choices=[member.value for member in E2BSandboxType],
        help=(
            "E2B sandbox interface to create. `e2b` provides a bash-style interface; "
            "`e2b_code_interpreter` provides a Jupyter-style interface."
        ),
    )
    parser.add_argument("--template", default=None, help="Optional E2B template name.")
    parser.add_argument(
        "--timeout",
        type=int,
        default=300,
        help="Optional E2B sandbox timeout in seconds.",
    )
    parser.add_argument("--stream", action="store_true", default=False, help="Stream the response.")
    args = parser.parse_args()

    asyncio.run(
        main(
            model=args.model,
            question=args.question,
            sandbox_type=args.sandbox_type,
            template=args.template,
            timeout=args.timeout,
            stream=args.stream,
        )
    )
