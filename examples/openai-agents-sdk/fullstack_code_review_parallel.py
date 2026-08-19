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
from examples.sandbox.misc.workspace_shell import WorkspaceShellCapability

DEFAULT_MODEL = "gpt-5.6-terra"
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_FRONTEND_PORT = 8765


class FrontendReview(BaseModel):
    summary: str
    ux_risks: list[str] = Field(min_length=1)
    code_risks: list[str] = Field(min_length=1)
    app_port: int
    screenshot_path: str
    evidence_files: list[str] = Field(min_length=1)


class BackendReview(BaseModel):
    summary: str
    api_risks: list[str] = Field(min_length=1)
    validation_risks: list[str] = Field(min_length=1)
    evidence_files: list[str] = Field(min_length=1)


class GitTreeReview(BaseModel):
    summary: str
    high_risks: list[str] = Field(min_length=1)
    evidence_files: list[str] = Field(min_length=1)


class FullstackReviewSummary(BaseModel):
    top_findings: list[str] = Field(min_length=3)
    frontend_preview_url: str
    frontend_screenshot_path: str
    recommendation: str


def _frontend_manifest() -> Any:
    capture_script = """\
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


PORT = int(os.environ.get("APP_PORT", "8765"))
server = subprocess.Popen(
    [sys.executable, "-m", "http.server", str(PORT), "--directory", "app"],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)

try:
    for _ in range(80):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}", timeout=1)
            break
        except Exception:
            time.sleep(0.25)
    else:
        raise RuntimeError("frontend server did not become ready")

    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "playwright"])
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])

    from playwright.sync_api import sync_playwright

    Path("artifacts").mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1024})
        page.goto(f"http://127.0.0.1:{PORT}", wait_until="networkidle")
        page.screenshot(path="artifacts/frontend-review.png", full_page=True)
        browser.close()
finally:
    server.terminate()
    try:
        server.wait(timeout=5)
    except Exception:
        server.kill()
"""
    return text_manifest(
        {
            "README.md": (
                "Frontend review workspace.\n"
                "Serve app/ on port 8765, capture a screenshot, and review both code and rendered UI.\n"
            ),
            "app/index.html": (
                "<!doctype html>\n"
                "<html>\n"
                "  <head>\n"
                '    <meta charset="utf-8" />\n'
                '    <meta name="viewport" content="width=device-width, initial-scale=1" />\n'
                "    <title>Acme Ops Console</title>\n"
                '    <link rel="stylesheet" href="styles.css" />\n'
                "  </head>\n"
                "  <body>\n"
                '    <main class="shell">\n'
                '      <header class="hero">\n'
                '        <p class="eyebrow">Operations cockpit</p>\n'
                "        <h1>Ship customer changes before lunch.</h1>\n"
                '        <p class="lede">A tiny reviewer target app with intentionally rough edges.</p>\n'
                '        <div class="actions">\n'
                '          <button class="primary">Create deployment</button>\n'
                '          <button class="ghost">Compare incidents</button>\n'
                "        </div>\n"
                "      </header>\n"
                '      <section class="panel-grid">\n'
                '        <article class="card danger">\n'
                "          <h2>Production Changes</h2>\n"
                "          <ul>\n"
                "            <li>17 pending rollouts</li>\n"
                "            <li>2 migrations without owners</li>\n"
                "          </ul>\n"
                "        </article>\n"
                '        <article class="card metric-card">\n'
                "          <h2>Latency</h2>\n"
                '          <p class="metric">412ms</p>\n'
                '          <p class="delta">up 28% vs yesterday</p>\n'
                "        </article>\n"
                "      </section>\n"
                "    </main>\n"
                '    <script src="app.js"></script>\n'
                "  </body>\n"
                "</html>\n"
            ),
            "app/styles.css": (
                ":root {\n"
                "  color-scheme: light;\n"
                "  font-family: Arial, sans-serif;\n"
                "  background: #f4efe7;\n"
                "  color: #33261d;\n"
                "}\n"
                "body { margin: 0; }\n"
                ".shell { max-width: 1180px; margin: 0 auto; padding: 48px 24px 96px; }\n"
                ".hero { background: #fff4db; padding: 32px; border-radius: 24px; }\n"
                ".eyebrow { text-transform: uppercase; letter-spacing: 0.24em; font-size: 12px; }\n"
                ".lede { max-width: 540px; color: #6d5a4c; }\n"
                ".actions { display: flex; gap: 12px; margin-top: 24px; }\n"
                "button { border: 0; border-radius: 999px; padding: 14px 22px; font-size: 16px; cursor: pointer; }\n"
                ".primary { background: #f1d55c; color: #f7e8a3; }\n"
                ".ghost { background: transparent; border: 1px solid #8d745f; color: #8d745f; }\n"
                ".panel-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 24px; }\n"
                ".card { background: white; border-radius: 20px; padding: 20px; min-height: 220px; }\n"
                ".danger { background: #2a2a2a; color: #3d3d3d; }\n"
                ".metric-card { position: relative; left: 64px; }\n"
                ".metric { font-size: 72px; line-height: 1; margin: 8px 0; }\n"
                ".delta { color: #9a4f4f; }\n"
                "@media (max-width: 720px) {\n"
                "  .panel-grid { grid-template-columns: 1fr; }\n"
                "  .metric-card { left: 0; }\n"
                "}\n"
            ),
            "app/app.js": (
                "document.querySelector('.primary')?.addEventListener('click', () => {\n"
                "  document.body.insertAdjacentHTML(\n"
                "    'beforeend',\n"
                "    '<div class=\"toast\">deployment created</div>'\n"
                "  );\n"
                "});\n"
            ),
            "capture_frontend.py": capture_script,
        }
    )


def _backend_manifest() -> Any:
    return text_manifest(
        {
            "README.md": "Backend review workspace.\n",
            "backend/server.py": (
                "from __future__ import annotations\n\n"
                "from fastapi import FastAPI, Request\n\n"
                "app = FastAPI()\n\n"
                "@app.post('/v1/deployments')\n"
                "async def create_deployment(request: Request) -> dict:\n"
                "    payload = await request.json()\n"
                "    region = payload.get('region', 'us-east-1')\n"
                "    rollback = payload.get('rollback', False)\n"
                "    # TODO: auth to be added later.\n"
                "    return {'ok': True, 'region': region, 'rollback': rollback, 'request': payload}\n"
            ),
            "backend/tests/test_server.py": (
                "from backend.server import app\n\n"
                "def test_placeholder() -> None:\n"
                "    assert app.title == 'FastAPI'\n"
            ),
            "backend/notes.md": (
                "# Backend Notes\n\n"
                "- This endpoint should eventually require auth.\n"
                "- Region must be one of the configured deployment regions.\n"
                "- Rollback requests should be tracked separately from create requests.\n"
            ),
        }
    )


def _frontend_tree_manifest() -> Any:
    return text_manifest(
        {
            "README.md": "Frontend git-tree review lane.\n",
            "git_status.txt": (
                "## feat/review-bot\n M app/index.html\n M app/styles.css\n M app/app.js\n"
            ),
            "frontend.diff": (
                "diff --git a/app/styles.css b/app/styles.css\n"
                "@@\n"
                "-.primary { background: #1f6feb; color: white; }\n"
                "+.primary { background: #f1d55c; color: #f7e8a3; }\n"
                "@@\n"
                "-.metric-card { position: static; }\n"
                "+.metric-card { position: relative; left: 64px; }\n"
                "@@\n"
                "-button[aria-label] { }\n"
                "+button { }\n"
            ),
        }
    )


def _backend_tree_manifest() -> Any:
    return text_manifest(
        {
            "README.md": "Backend git-tree review lane.\n",
            "git_status.txt": (
                "## feat/review-bot\n M backend/server.py\n M backend/tests/test_server.py\n"
            ),
            "backend.diff": (
                "diff --git a/backend/server.py b/backend/server.py\n"
                "@@\n"
                "+@app.post('/v1/deployments')\n"
                "+async def create_deployment(request: Request) -> dict:\n"
                "+    payload = await request.json()\n"
                "+    region = payload.get('region', 'us-east-1')\n"
                "+    rollback = payload.get('rollback', False)\n"
                "+    return {'ok': True, 'region': region, 'rollback': rollback, 'request': payload}\n"
            ),
        }
    )


def _make_run_config(
    *,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
    exposed_ports: tuple[int, ...] = (),
) -> RunConfig:
    return RunConfig(
        sandbox=SandboxRunConfig(
            client=E2BSandboxClient(),
            options=E2BSandboxClientOptions(
                sandbox_type=sandbox_type,
                template=template,
                timeout=timeout_seconds,
                exposed_ports=exposed_ports,
                allow_internet_access=True,
                pause_on_exit=True,
            ),
        )
    )


def _build_frontend_reviewer(
    *,
    model: str,
    manifest: Any,
) -> SandboxAgent:
    return SandboxAgent(
        name="Frontend Reviewer",
        model=model,
        instructions=(
            "Review the frontend implementation. Inspect the app code, run the preview capture script, "
            "and return a structured review grounded in both code and rendered output."
        ),
        developer_instructions=(
            "Use the shell tool. Run `APP_PORT=8765 python capture_frontend.py`. "
            "After that, inspect `artifacts/frontend-review.png`, `app/index.html`, `app/styles.css`, "
            "and `app/app.js`. app_port must be 8765. screenshot_path must be "
            "`artifacts/frontend-review.png`. Do not invent evidence files."
        ),
        default_manifest=manifest,
        capabilities=[WorkspaceShellCapability()],
        model_settings=ModelSettings(tool_choice="required"),
        output_type=FrontendReview,
    )


def _build_backend_reviewer(*, model: str, manifest: Any) -> SandboxAgent:
    return SandboxAgent(
        name="Backend Reviewer",
        model=model,
        instructions=(
            "Review the backend API implementation and return a structured review with the most "
            "important API and validation risks."
        ),
        developer_instructions=(
            "Use the shell tool. Inspect `backend/server.py`, `backend/tests/test_server.py`, and "
            "`backend/notes.md` before answering. Do not invent framework behavior or tests."
        ),
        default_manifest=manifest,
        capabilities=[WorkspaceShellCapability()],
        model_settings=ModelSettings(tool_choice="required"),
        output_type=BackendReview,
    )


def _build_tree_reviewer(
    *,
    name: str,
    model: str,
    manifest: Any,
    target_diff: str,
) -> SandboxAgent:
    return SandboxAgent(
        name=name,
        model=model,
        instructions=(
            "Review the provided git-tree artifacts and return a structured review focused on the "
            "highest-risk changes."
        ),
        developer_instructions=(
            f"Use the shell tool. Inspect `git_status.txt` and `{target_diff}` before answering. "
            "Base findings only on the supplied diff and status output."
        ),
        default_manifest=manifest,
        capabilities=[WorkspaceShellCapability()],
        model_settings=ModelSettings(tool_choice="required"),
        output_type=GitTreeReview,
    )


async def _json_output(result: Any) -> str:
    final_output = result.final_output
    if isinstance(final_output, BaseModel):
        return json.dumps(final_output.model_dump(mode="json"), sort_keys=True)
    return str(final_output)


def _capture_preview_screenshot(preview_url: str) -> str | None:
    screenshot_path = os.path.join(tempfile.gettempdir(), "openai-agents-fullstack-review.png")
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "playwright"])
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
        from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1024})
        page.goto(preview_url, wait_until="networkidle")
        page.screenshot(path=screenshot_path, full_page=True)
        browser.close()
    return screenshot_path


async def _frontend_output_with_preview(result: Any, session: Any) -> str:
    final_output = result.final_output
    payload = final_output.model_dump(mode="json") if isinstance(final_output, BaseModel) else {}
    endpoint = await session.resolve_exposed_port(int(payload["app_port"]))
    preview_url = endpoint.url_for("http")
    payload["preview_url"] = preview_url
    try:
        payload["host_screenshot_path"] = await asyncio.to_thread(
            _capture_preview_screenshot, preview_url
        )
    except Exception as exc:
        payload["host_screenshot_error"] = str(exc)
    return json.dumps(payload, sort_keys=True)


async def main(
    *,
    model: str,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
    question: str,
) -> None:
    frontend_manifest = _frontend_manifest()
    backend_manifest = _backend_manifest()
    frontend_tree_manifest = _frontend_tree_manifest()
    backend_tree_manifest = _backend_tree_manifest()

    frontend_reviewer = _build_frontend_reviewer(model=model, manifest=frontend_manifest)
    backend_reviewer = _build_backend_reviewer(model=model, manifest=backend_manifest)
    frontend_tree_reviewer = _build_tree_reviewer(
        name="Frontend Git Reviewer",
        model=model,
        manifest=frontend_tree_manifest,
        target_diff="frontend.diff",
    )
    backend_tree_reviewer = _build_tree_reviewer(
        name="Backend Git Reviewer",
        model=model,
        manifest=backend_tree_manifest,
        target_diff="backend.diff",
    )

    frontend_client = E2BSandboxClient()
    frontend_session = await frontend_client.create(
        manifest=frontend_manifest,
        options=E2BSandboxClientOptions(
            sandbox_type=sandbox_type,
            template=template,
            timeout=timeout_seconds,
            exposed_ports=(DEFAULT_FRONTEND_PORT,),
            allow_internet_access=True,
            pause_on_exit=True,
        ),
    )
    await frontend_session.start()

    try:
        orchestrator = Agent(
            name="Fullstack Code Review Coordinator",
            model=model,
            instructions=(
                "You are coordinating a full-stack code review. Before answering, you must call all "
                "four review tools exactly once: frontend runtime review, backend review, frontend "
                "git-tree review, and backend git-tree review. The review tools are independent, so "
                "call them in parallel in the same turn. The frontend runtime review output includes "
                "a resolved `preview_url`; use that exact URL in the final answer. If the frontend "
                "runtime output includes `host_screenshot_path`, prefer that value for the final "
                "screenshot path."
            ),
            model_settings=ModelSettings(tool_choice="required", parallel_tool_calls=True),
            tools=[
                frontend_reviewer.as_tool(
                    tool_name="review_frontend_runtime",
                    tool_description="Run the frontend in a sandbox, capture a screenshot, and review it.",
                    custom_output_extractor=lambda result: _frontend_output_with_preview(
                        result, frontend_session
                    ),
                    run_config=RunConfig(sandbox=SandboxRunConfig(session=frontend_session)),
                ),
                backend_reviewer.as_tool(
                    tool_name="review_backend_runtime",
                    tool_description="Inspect the backend service implementation in its own sandbox.",
                    custom_output_extractor=_json_output,
                    run_config=_make_run_config(
                        sandbox_type=sandbox_type,
                        template=template,
                        timeout_seconds=timeout_seconds,
                    ),
                ),
                frontend_tree_reviewer.as_tool(
                    tool_name="review_frontend_gittree",
                    tool_description="Review the frontend git diff in its own sandbox.",
                    custom_output_extractor=_json_output,
                    run_config=_make_run_config(
                        sandbox_type=sandbox_type,
                        template=template,
                        timeout_seconds=timeout_seconds,
                    ),
                ),
                backend_tree_reviewer.as_tool(
                    tool_name="review_backend_gittree",
                    tool_description="Review the backend git diff in its own sandbox.",
                    custom_output_extractor=_json_output,
                    run_config=_make_run_config(
                        sandbox_type=sandbox_type,
                        template=template,
                        timeout_seconds=timeout_seconds,
                    ),
                ),
            ],
            output_type=FullstackReviewSummary,
        )

        result = await Runner.run(orchestrator, question)
        tool_names = [
            tool_call_name(item.raw_item)
            for item in result.new_items
            if getattr(item, "type", None) == "tool_call_item"
        ]
        print(
            json.dumps(
                {
                    "tool_names": tool_names,
                    "final_output": result.final_output.model_dump(mode="json"),
                },
                indent=2,
            )
        )
    finally:
        await frontend_session.shutdown()


def _require_credentials() -> None:
    missing = [name for name in ("OPENAI_API_KEY", "E2B_API_KEY") if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run a parallel full-stack code review example in E2B sandboxes."
    )
    parser.add_argument("--model", default=os.getenv("OPENAI_MODEL", DEFAULT_MODEL))
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
    parser.add_argument(
        "--question",
        default=(
            "Run the frontend runtime review, backend review, and both git-tree reviews. Then give "
            "me the top findings, the frontend preview URL, the screenshot path, and a concise "
            "recommendation for what to fix first."
        ),
    )
    args = parser.parse_args()
    _require_credentials()
    asyncio.run(
        main(
            model=args.model,
            sandbox_type=E2BSandboxType(args.sandbox_type),
            template=args.template,
            timeout_seconds=args.timeout,
            question=args.question,
        )
    )
