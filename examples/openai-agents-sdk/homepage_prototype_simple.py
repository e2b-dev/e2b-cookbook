"""Basic homepage prototyping example with one E2B sandbox and one worker agent."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from agents import Runner
from agents.extensions.sandbox import E2BSandboxClient, E2BSandboxClientOptions, E2BSandboxType
from examples.sandbox.extensions.e2b.homepage_prototype_parallel import (
    DEFAULT_BRIEF,
    DEFAULT_FRONTEND_PORT,
    DEFAULT_MODEL,
    DEFAULT_TIMEOUT_SECONDS,
    PROTOTYPE_DIRECTIONS,
    _build_prototype_agent,
    _build_run_config,
    _prototype_manifest,
    _prototype_output_with_preview,
    require_credentials,
)


async def run_homepage_basic_demo(
    *,
    model: str,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
    homepage_brief: str = DEFAULT_BRIEF,
    direction: dict[str, str] | None = None,
    shutdown_session: bool = False,
) -> dict[str, Any]:
    selected_direction = direction or PROTOTYPE_DIRECTIONS[0]
    manifest = _prototype_manifest(selected_direction["name"], selected_direction["brief"])
    session = await E2BSandboxClient().create(
        manifest=manifest,
        options=E2BSandboxClientOptions(
            sandbox_type=sandbox_type,
            template=template,
            timeout=timeout_seconds,
            exposed_ports=(DEFAULT_FRONTEND_PORT,),
            allow_internet_access=True,
            pause_on_exit=True,
        ),
    )

    try:
        await session.start()
        agent = _build_prototype_agent(
            model=model,
            manifest=manifest,
            direction_name=selected_direction["name"],
            direction_brief=selected_direction["brief"],
            homepage_brief=homepage_brief,
        )
        result = await Runner.run(
            agent,
            "Build the homepage prototype now, serve it, and return the structured summary.",
            run_config=_build_run_config(
                sandbox_type=sandbox_type,
                template=template,
                timeout_seconds=timeout_seconds,
                session=session,
            ),
        )
        payload = json.loads(await _prototype_output_with_preview(result, session))
        return {
            "direction": payload["direction"],
            "summary": payload["summary"],
            "design_rationale": payload["design_rationale"],
            "preview_url": payload["preview_url"],
            "screenshot_path": payload["host_screenshot_path"],
            "sandbox_id": getattr(session, "sandbox_id", None),
            "sandbox_left_running": not shutdown_session,
        }
    finally:
        if shutdown_session:
            try:
                await session.shutdown()
            except Exception:
                pass


async def run_homepage_simple_demo(
    *,
    model: str,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
    homepage_brief: str = DEFAULT_BRIEF,
    direction: dict[str, str] | None = None,
    shutdown_session: bool = False,
) -> dict[str, Any]:
    """Backward-compatible alias for the basic single-sandbox example."""
    return await run_homepage_basic_demo(
        model=model,
        sandbox_type=sandbox_type,
        template=template,
        timeout_seconds=timeout_seconds,
        homepage_brief=homepage_brief,
        direction=direction,
        shutdown_session=shutdown_session,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run the basic single-sandbox homepage prototype example in E2B."
    )
    parser.add_argument(
        "--model",
        default=os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
        help="Model to use for the prototype worker.",
    )
    parser.add_argument(
        "--sandbox-type",
        default=os.getenv("E2B_SANDBOX_TYPE", E2BSandboxType.E2B.value),
        choices=[member.value for member in E2BSandboxType],
    )
    parser.add_argument("--template", default=os.getenv("E2B_TEMPLATE") or None)
    parser.add_argument(
        "--timeout",
        type=int,
        default=int(os.getenv("E2B_TIMEOUT", str(DEFAULT_TIMEOUT_SECONDS))),
    )
    parser.add_argument("--brief", default=DEFAULT_BRIEF)
    parser.add_argument(
        "--direction",
        default=PROTOTYPE_DIRECTIONS[0]["name"],
        choices=[direction["name"] for direction in PROTOTYPE_DIRECTIONS],
        help="Which art direction to prototype.",
    )
    parser.add_argument(
        "--shutdown-session",
        action="store_true",
        help="Shut down the sandbox before exiting instead of leaving the preview URL live.",
    )
    args = parser.parse_args()
    require_credentials()
    selected_direction = next(
        direction for direction in PROTOTYPE_DIRECTIONS if direction["name"] == args.direction
    )
    payload = asyncio.run(
        run_homepage_basic_demo(
            model=args.model,
            sandbox_type=E2BSandboxType(args.sandbox_type),
            template=args.template,
            timeout_seconds=args.timeout,
            homepage_brief=args.brief,
            direction=selected_direction,
            shutdown_session=args.shutdown_session,
        )
    )
    print(json.dumps(payload, indent=2))
