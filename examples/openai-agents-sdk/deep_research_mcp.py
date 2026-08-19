from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Any, cast

from openai.types.responses import ResponseTextDeltaEvent

from agents import ModelSettings, Runner, gen_trace_id, trace
from agents.mcp import MCPServerStreamableHttp
from agents.run import RunConfig
from agents.sandbox import Manifest, SandboxAgent, SandboxRunConfig

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from examples.sandbox.misc.example_support import text_manifest
from examples.sandbox.misc.workspace_shell import WorkspaceShellCapability

try:
    from agents.extensions.sandbox import (
        E2BSandboxClient,
        E2BSandboxClientOptions,
        E2BSandboxSession,
        E2BSandboxSessionState,
        E2BSandboxType,
    )
except Exception as exc:  # pragma: no cover - import path depends on optional extras
    raise SystemExit(
        "E2B sandbox examples require the optional repo extra.\n"
        "Install it with: uv sync --extra e2b"
    ) from exc


DEFAULT_MODEL = "gpt-5.6-terra"
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_QUERY = (
    "Research browser automation infrastructure for AI agents. "
    "Use Exa to discover strong sources, use Browserbase to verify the most important claims, "
    "and compare Browserbase with at least two alternatives."
)


def _build_manifest() -> Manifest:
    return text_manifest(
        {
            "brief.md": (
                "# Research brief\n\n"
                "Goal: understand how teams use browser automation infrastructure for AI agents.\n"
                "Requirements:\n"
                "- find strong primary sources\n"
                "- verify the most important pages in a real browser\n"
                "- compare Browserbase with alternatives\n"
                "- keep the final memo concise and source-backed\n"
            ),
            "deliverable.md": (
                "# Deliverable\n\n"
                "Return:\n"
                "1. Executive summary.\n"
                "2. Key findings.\n"
                "3. Comparison table or bullets.\n"
                "4. Sources verified.\n"
            ),
        }
    )


def _build_agent(*, model: str, server: MCPServerStreamableHttp) -> SandboxAgent:
    return SandboxAgent(
        name="E2B Deep Research Assistant",
        model=model,
        instructions=(
            "You are a deep research assistant working inside an E2B sandbox. "
            "Inspect the workspace brief first. Then use Exa to discover promising sources and "
            "Browserbase to verify the most important pages before you answer."
        ),
        developer_instructions=(
            "Do not rely on unverified claims. Your final answer must include a short summary, "
            "key findings, and a list of the sources you verified through the MCP tools."
        ),
        default_manifest=_build_manifest(),
        capabilities=[WorkspaceShellCapability()],
        mcp_servers=[server],
        model_settings=ModelSettings(tool_choice="required"),
    )


def _mcp_config() -> dict[str, dict[str, str]]:
    return {
        "browserbase": {
            "apiKey": _require_env("BROWSERBASE_API_KEY"),
            "geminiApiKey": _require_env("GEMINI_API_KEY"),
            "projectId": _require_env("BROWSERBASE_PROJECT_ID"),
        },
        "exa": {
            "apiKey": _require_env("EXA_API_KEY"),
        },
    }


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if value:
        return value
    raise SystemExit(f"{name} must be set before running this example.")


async def _get_mcp_details(session: Any) -> tuple[str, str]:
    inner = getattr(session, "_inner", None)
    if not isinstance(inner, E2BSandboxSession):
        raise RuntimeError("Could not access the underlying E2B sandbox for MCP setup.")

    sandbox = inner._sandbox
    get_url = getattr(sandbox, "get_mcp_url", None)
    get_token = getattr(sandbox, "get_mcp_token", None)
    if not callable(get_url) or not callable(get_token):
        raise RuntimeError("The installed E2B SDK does not expose MCP gateway helpers.")

    mcp_url = await cast(Any, get_url)()
    mcp_token = await cast(Any, get_token)()
    if not mcp_url or not mcp_token:
        raise RuntimeError("E2B did not return MCP connection details for this sandbox.")
    return str(mcp_url), str(mcp_token)


async def main(*, model: str, query: str, timeout: int, stream: bool) -> None:
    _require_env("OPENAI_API_KEY")
    _require_env("E2B_API_KEY")

    client = E2BSandboxClient()
    manifest = _build_manifest()
    session = await client.create(
        manifest=manifest,
        options=E2BSandboxClientOptions(
            sandbox_type=E2BSandboxType.E2B,
            timeout=timeout,
            pause_on_exit=True,
            mcp=_mcp_config(),
        ),
    )

    try:
        mcp_url, mcp_token = await _get_mcp_details(session)
        async with MCPServerStreamableHttp(
            name="E2B MCP Gateway",
            params={
                "url": mcp_url,
                "headers": {"Authorization": f"Bearer {mcp_token}"},
                "timeout": 30,
                "sse_read_timeout": 300,
            },
            max_retry_attempts=2,
            retry_backoff_seconds_base=2.0,
            client_session_timeout_seconds=30,
        ) as server:
            agent = _build_agent(model=model, server=server)
            trace_id = gen_trace_id()
            with trace(workflow_name="E2B deep research MCP example", trace_id=trace_id):
                session_state = cast(E2BSandboxSessionState, session.state)
                print(f"View trace: https://platform.openai.com/traces/trace?trace_id={trace_id}\n")
                print(f"E2B sandbox: {session_state.sandbox_id}")
                print(f"MCP gateway: {mcp_url}\n")

                run_config = RunConfig(sandbox=SandboxRunConfig(session=session))
                if not stream:
                    run_result = await Runner.run(agent, query, run_config=run_config)
                    print(run_result.final_output)
                    return

                stream_result = Runner.run_streamed(agent, query, run_config=run_config)
                saw_text_delta = False
                async for event in stream_result.stream_events():
                    if event.type == "raw_response_event" and isinstance(
                        event.data, ResponseTextDeltaEvent
                    ):
                        if not saw_text_delta:
                            print("assistant> ", end="", flush=True)
                            saw_text_delta = True
                        print(event.data.delta, end="", flush=True)

                if saw_text_delta:
                    print()
    finally:
        await session.shutdown()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Model name to use.")
    parser.add_argument("--query", default=DEFAULT_QUERY, help="Research prompt to send.")
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="E2B sandbox timeout in seconds.",
    )
    parser.add_argument("--stream", action="store_true", default=False, help="Stream the output.")
    args = parser.parse_args()

    asyncio.run(
        main(
            model=args.model,
            query=args.query,
            timeout=args.timeout,
            stream=args.stream,
        )
    )
