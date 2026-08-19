"""Advanced homepage prototyping example with multiple E2B sandboxes and a coordinator agent."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import tempfile
from typing import Any

from pydantic import BaseModel, Field

from agents import Agent, ModelSettings, Runner
from agents.run import RunConfig
from agents.sandbox import SandboxAgent, SandboxRunConfig

if __package__ is None or __package__ == "":
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from agents.extensions.sandbox import E2BSandboxClient, E2BSandboxClientOptions, E2BSandboxType
from examples.sandbox.misc.example_support import text_manifest, tool_call_name
from examples.sandbox.misc.workspace_apply_patch import WorkspaceApplyPatchCapability
from examples.sandbox.misc.workspace_shell import WorkspaceShellCapability

DEFAULT_MODEL = "gpt-5.6-luna"
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_FRONTEND_PORT = 8765


class PrototypeResult(BaseModel):
    direction: str
    summary: str
    design_rationale: list[str] = Field(min_length=2)
    app_port: int
    evidence_files: list[str] = Field(min_length=1)


class PrototypeCard(BaseModel):
    direction: str
    preview_url: str
    screenshot_path: str
    summary: str
    design_rationale: list[str] = Field(min_length=2)


class PrototypeSelection(BaseModel):
    winner_direction: str
    shortlist: list[str] = Field(min_length=2)
    recommendation: str


DEFAULT_BRIEF = (
    "Create homepage concepts for Orbit, an AI operations platform for small product teams. "
    "The homepage should feel premium, clear, and credible instead of generic SaaS sludge. "
    "Primary CTA: Start a live workspace. Secondary CTA: See customer stories."
)


PROTOTYPE_DIRECTIONS: list[dict[str, str]] = [
    {
        "name": "editorial_launch",
        "brief": (
            "Make it feel like a confident editorial launch page with big typography, layered "
            "background shapes, and a high-end magazine mood."
        ),
    },
    {
        "name": "product_control_room",
        "brief": (
            "Make it feel like a product control room: dense but elegant, dashboard-adjacent, "
            "strong hierarchy, and sharp enterprise credibility."
        ),
    },
    {
        "name": "warm_trust_system",
        "brief": (
            "Make it feel warm and trustworthy for teams adopting AI for the first time. Use a "
            "lighter, more approachable system without losing polish."
        ),
    },
]


def _prototype_manifest(direction_name: str, direction_brief: str) -> Any:
    return text_manifest(
        {
            "README.md": (
                "Homepage prototype sandbox.\n"
                f"Direction: {direction_name}\n"
                f"Direction brief: {direction_brief}\n"
                "Edit app/index.html and app/styles.css, then serve app/ on port 8765.\n"
            ),
            "app/index.html": (
                "<!doctype html>\n"
                "<html>\n"
                "  <head>\n"
                '    <meta charset="utf-8" />\n'
                '    <meta name="viewport" content="width=device-width, initial-scale=1" />\n'
                "    <title>Orbit</title>\n"
                '    <link rel="stylesheet" href="styles.css" />\n'
                "  </head>\n"
                "  <body>\n"
                '    <main class="page-shell">\n'
                '      <section class="hero">\n'
                '        <p class="eyebrow">Orbit</p>\n'
                "        <h1>AI operations, without the handoff chaos.</h1>\n"
                '        <p class="lede">A placeholder homepage ready for a more distinctive direction.</p>\n'
                '        <div class="actions">\n'
                '          <a class="primary" href="#">Start a live workspace</a>\n'
                '          <a class="secondary" href="#">See customer stories</a>\n'
                "        </div>\n"
                "      </section>\n"
                '      <section class="proof-grid">\n'
                '        <article class="card"><h2>Plans</h2><p>Track releases, risk, and approvals.</p></article>\n'
                '        <article class="card"><h2>Signals</h2><p>Watch the metrics that matter.</p></article>\n'
                '        <article class="card"><h2>Handoffs</h2><p>Keep operations moving in one place.</p></article>\n'
                "      </section>\n"
                "    </main>\n"
                "  </body>\n"
                "</html>\n"
            ),
            "app/styles.css": (
                ":root {\n"
                "  font-family: Arial, sans-serif;\n"
                "  color: #1f1f1f;\n"
                "  background: #faf7f1;\n"
                "}\n"
                "body { margin: 0; }\n"
                ".page-shell { max-width: 1120px; margin: 0 auto; padding: 56px 24px 96px; }\n"
                ".hero { padding: 32px; background: white; border-radius: 24px; }\n"
                ".eyebrow { text-transform: uppercase; letter-spacing: 0.24em; font-size: 12px; }\n"
                ".lede { max-width: 560px; color: #5f5a55; }\n"
                ".actions { display: flex; gap: 12px; margin-top: 24px; }\n"
                ".primary, .secondary { text-decoration: none; padding: 14px 22px; border-radius: 999px; }\n"
                ".primary { background: #111111; color: white; }\n"
                ".secondary { border: 1px solid #b8b0a7; color: #1f1f1f; }\n"
                ".proof-grid { display: grid; gap: 18px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 24px; }\n"
                ".card { background: white; border-radius: 20px; padding: 20px; }\n"
                "@media (max-width: 720px) {\n"
                "  .proof-grid { grid-template-columns: 1fr; }\n"
                "  .actions { flex-direction: column; }\n"
                "}\n"
            ),
        }
    )


def _build_run_config(
    *,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
    exposed_ports: tuple[int, ...] = (),
    session: Any | None = None,
) -> RunConfig:
    return RunConfig(
        sandbox=SandboxRunConfig(
            client=None if session is not None else E2BSandboxClient(),
            session=session,
            options=None
            if session is not None
            else E2BSandboxClientOptions(
                sandbox_type=sandbox_type,
                template=template,
                timeout=timeout_seconds,
                exposed_ports=exposed_ports,
                allow_internet_access=True,
                pause_on_exit=True,
            ),
        )
    )


def _build_prototype_agent(
    *,
    model: str,
    manifest: Any,
    direction_name: str,
    direction_brief: str,
    homepage_brief: str,
) -> SandboxAgent:
    return SandboxAgent(
        name=f"Homepage Prototyper {direction_name}",
        model=model,
        instructions=(
            "Design and implement a bold homepage prototype in the sandbox workspace. Edit the app "
            "files directly, then serve the app and return a concise structured summary."
        ),
        developer_instructions=(
            f"Homepage brief: {homepage_brief}\n"
            f"Direction name: {direction_name}\n"
            f"Direction brief: {direction_brief}\n"
            "Use apply_patch for code edits and shell for inspection/serving. Rewrite `app/index.html` "
            "and `app/styles.css` to match the direction. Avoid generic SaaS layouts. Use expressive "
            "typography, a clear visual idea, and a desktop/mobile-safe layout. After editing, start "
            "a background HTTP server with `python -m http.server 8765 --directory app`. app_port must "
            "be 8765. Keep the final summary grounded in the files you actually changed."
        ),
        default_manifest=manifest,
        capabilities=[WorkspaceApplyPatchCapability(), WorkspaceShellCapability()],
        model_settings=ModelSettings(tool_choice="required"),
        output_type=PrototypeResult,
    )


async def _json_output(result: Any) -> str:
    final_output = result.final_output
    if isinstance(final_output, BaseModel):
        return json.dumps(final_output.model_dump(mode="json"), sort_keys=True)
    return str(final_output)


def _capture_preview_screenshot(preview_url: str, direction: str) -> str:
    screenshot_path = os.path.join(tempfile.gettempdir(), f"openai-agents-homepage-{direction}.png")
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "playwright"])
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
        from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1100})
        page.goto(preview_url, wait_until="networkidle")
        page.screenshot(path=screenshot_path, full_page=True)
        browser.close()
    return screenshot_path


async def _prototype_output_with_preview(result: Any, session: Any) -> str:
    final_output = result.final_output
    payload = final_output.model_dump(mode="json") if isinstance(final_output, BaseModel) else {}
    endpoint = await session.resolve_exposed_port(int(payload["app_port"]))
    preview_url = endpoint.url_for("http")
    payload["preview_url"] = preview_url
    payload["host_screenshot_path"] = await asyncio.to_thread(
        _capture_preview_screenshot, preview_url, str(payload["direction"])
    )
    return json.dumps(payload, sort_keys=True)


def _make_prototype_output_extractor(
    *,
    session: Any,
    collected_payloads: dict[str, dict[str, Any]],
):
    async def _extract(result: Any) -> str:
        output = await _prototype_output_with_preview(result, session)
        payload = json.loads(output)
        collected_payloads[str(payload["direction"])] = payload
        return output

    return _extract


async def run_homepage_advanced_demo(
    *,
    model: str,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
    homepage_brief: str = DEFAULT_BRIEF,
    directions: list[dict[str, str]] | None = None,
    shutdown_sessions: bool = False,
) -> dict[str, Any]:
    selected_directions = directions or PROTOTYPE_DIRECTIONS
    sessions: list[Any] = []
    tools: list[Any] = []
    collected_payloads: dict[str, dict[str, Any]] = {}

    try:
        for direction in selected_directions:
            manifest = _prototype_manifest(direction["name"], direction["brief"])
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
            await session.start()
            sessions.append(session)

            agent = _build_prototype_agent(
                model=model,
                manifest=manifest,
                direction_name=direction["name"],
                direction_brief=direction["brief"],
                homepage_brief=homepage_brief,
            )
            tools.append(
                agent.as_tool(
                    tool_name=f"build_{direction['name']}",
                    tool_description=(
                        f"Build the homepage prototype for the {direction['name']} direction in its "
                        "own sandbox, then return the preview URL and screenshot path."
                    ),
                    custom_output_extractor=_make_prototype_output_extractor(
                        session=session,
                        collected_payloads=collected_payloads,
                    ),
                    run_config=_build_run_config(
                        sandbox_type=sandbox_type,
                        template=template,
                        timeout_seconds=timeout_seconds,
                        session=session,
                    ),
                )
            )

        coordinator = Agent(
            name="Homepage Prototype Coordinator",
            model=model,
            instructions=(
                "You coordinate homepage prototype generation across multiple independent sandbox "
                "workers. Before answering, call every prototype tool exactly once. These prototype "
                "builds are independent, so call them in parallel in the same turn. After all "
                "results return, choose a winner and produce a shortlist."
            ),
            model_settings=ModelSettings(tool_choice="required", parallel_tool_calls=True),
            tools=tools,
            output_type=PrototypeSelection,
        )

        result = await Runner.run(
            coordinator,
            (
                f"Homepage brief: {homepage_brief}\n"
                "Build all prototype directions now. Return the winning direction, a shortlist, and "
                "a recommendation for which direction to develop further."
            ),
        )
        tool_names = [
            tool_call_name(item.raw_item)
            for item in result.new_items
            if getattr(item, "type", None) == "tool_call_item"
        ]

        prototype_cards: list[PrototypeCard] = []
        for direction in selected_directions:
            payload = collected_payloads.get(direction["name"])
            if payload is None:
                continue
            prototype_cards.append(
                PrototypeCard(
                    direction=payload["direction"],
                    preview_url=payload["preview_url"],
                    screenshot_path=payload["host_screenshot_path"],
                    summary=payload["summary"],
                    design_rationale=payload["design_rationale"],
                )
            )

        return {
            "tool_names": tool_names,
            "selection": result.final_output.model_dump(mode="json"),
            "prototypes": [card.model_dump(mode="json") for card in prototype_cards],
            "sandboxes": [
                {
                    "direction": direction["name"],
                    "sandbox_id": getattr(session, "sandbox_id", None),
                }
                for direction, session in zip(selected_directions, sessions, strict=False)
            ],
            "sandboxes_left_running": not shutdown_sessions,
        }
    finally:
        if shutdown_sessions:
            for session in sessions:
                try:
                    await session.shutdown()
                except Exception:
                    pass


async def run_homepage_parallel_demo(
    *,
    model: str,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
    homepage_brief: str = DEFAULT_BRIEF,
    directions: list[dict[str, str]] | None = None,
    shutdown_sessions: bool = False,
) -> dict[str, Any]:
    """Backward-compatible alias for the advanced coordinator example."""
    return await run_homepage_advanced_demo(
        model=model,
        sandbox_type=sandbox_type,
        template=template,
        timeout_seconds=timeout_seconds,
        homepage_brief=homepage_brief,
        directions=directions,
        shutdown_sessions=shutdown_sessions,
    )


async def run_homepage_complex_demo(
    *,
    model: str,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
    homepage_brief: str = DEFAULT_BRIEF,
    directions: list[dict[str, str]] | None = None,
    shutdown_sessions: bool = False,
) -> dict[str, Any]:
    """Backward-compatible alias for the advanced coordinator example."""
    return await run_homepage_advanced_demo(
        model=model,
        sandbox_type=sandbox_type,
        template=template,
        timeout_seconds=timeout_seconds,
        homepage_brief=homepage_brief,
        directions=directions,
        shutdown_sessions=shutdown_sessions,
    )


def require_credentials() -> None:
    missing = [name for name in ("OPENAI_API_KEY", "E2B_API_KEY") if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run the advanced parallel homepage prototype example in E2B sandboxes."
    )
    parser.add_argument(
        "--model",
        default=os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
        help=(
            "Model to use for the coordinator and worker agents. Defaults to gpt-5.4-mini "
            "because this example fans out multiple sandbox workers and benefits from lower tool "
            "planning latency."
        ),
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
        "--shutdown-sessions",
        action="store_true",
        help=(
            "Shut down the E2B sandboxes before exiting. Disabled by default so the returned "
            "preview URLs stay live until the sandbox timeout expires."
        ),
    )
    args = parser.parse_args()
    require_credentials()
    payload = asyncio.run(
        run_homepage_advanced_demo(
            model=args.model,
            sandbox_type=E2BSandboxType(args.sandbox_type),
            template=args.template,
            timeout_seconds=args.timeout,
            homepage_brief=args.brief,
            shutdown_sessions=args.shutdown_sessions,
        )
    )
    print(json.dumps(payload, indent=2))
