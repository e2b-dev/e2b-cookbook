from __future__ import annotations

import argparse
import asyncio
import os
import shlex
import sys
from pathlib import Path

from pydantic import BaseModel, Field

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[4]))
from agents import Agent, Runner, function_tool
from agents.extensions.sandbox import E2BSandboxClient, E2BSandboxClientOptions, E2BSandboxType
from agents.sandbox import Manifest
from agents.sandbox.session import SandboxSession
from examples.sandbox.misc.example_support import text_manifest

DEFAULT_TEMPLATE = "codex"
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_PREVIEW_PORT = 8000
DEFAULT_MODEL = "gpt-5.6-terra"
SITE_DIR = "site"


class WebsiteResult(BaseModel):
    summary: str = Field(description="Short explanation of what the agent completed.")
    generated_files: list[str] = Field(description="Website files created in the sandbox.")
    preview_url: str = Field(description="Public preview URL for the generated site.")
    codex_summary: str = Field(description="Short summary of Codex's reported work.")


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if value:
        return value
    raise SystemExit(f"{name} must be set before running this example.")


def _codex_api_key() -> str:
    value = os.environ.get("CODEX_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if value:
        return value
    raise SystemExit("Set CODEX_API_KEY or OPENAI_API_KEY before running this example.")


def _rewrite_template_resolution_error(exc: Exception) -> None:
    message = str(exc)
    marker = "error resolving template '"
    if marker not in message:
        return
    template = message.split(marker, 1)[1].split("'", 1)[0]
    raise SystemExit(
        f"E2B could not resolve template `{template}`.\n"
        "Pass `--template <your-template>` with a template that exists for this E2B account/team. "
        "The documented Codex flow expects the pre-built `codex` template to be available."
    ) from exc


def _workspace_manifest() -> Manifest:
    return text_manifest(
        {
            "README.md": (
                "# Sunrise Bakery Website Task\n\n"
                "Run Codex inside this E2B sandbox and build a polished static bakery website.\n"
                f"Write the final site into `{SITE_DIR}/`.\n"
            ),
            "briefs/bakery.md": (
                "# Brand brief\n\n"
                "Business: Sunrise Bakery\n"
                "Location: Berlin neighborhood bakery near a weekend market.\n"
                "Offerings: sourdough loaves, laminated pastries, seasonal fruit cakes, and coffee.\n"
                "Tone: warm, handcrafted, modern, and trustworthy.\n"
                "Primary call to action: Pre-order for pickup.\n"
                "Secondary call to action: View this week's menu.\n"
            ),
        }
    )


def _codex_prompt() -> str:
    return (
        "Create a responsive static marketing website for Sunrise Bakery. "
        "Work only inside the current workspace and place the final site in `site/`. "
        "Create `site/index.html` and `site/styles.css`, and add `site/app.js` only if it helps. "
        "Do not use external packages, frameworks, CDNs, or remote images. "
        "Use the bakery brief in `briefs/bakery.md` and build a homepage with a hero section, "
        "featured breads and pastries, bakery story, opening hours, pickup details, and clear calls "
        "to action. Make the design feel warm and intentional rather than generic, and keep the HTML "
        "accessible and mobile-friendly. After editing, verify the files exist and end with a short "
        "summary of what you created."
    )


def _decode(payload: bytes) -> str:
    return payload.decode("utf-8", errors="replace").strip()


class E2BCodexWorkspace:
    def __init__(self, *, template: str, timeout_seconds: int, preview_port: int) -> None:
        self._client = E2BSandboxClient()
        self._template = template
        self._timeout_seconds = timeout_seconds
        self._preview_port = preview_port
        self._session: SandboxSession | None = None

    async def create_sandbox(self) -> str:
        if self._session is not None:
            return "Sandbox already exists and is ready."

        try:
            session = await self._client.create(
                manifest=_workspace_manifest(),
                options=E2BSandboxClientOptions(
                    sandbox_type=E2BSandboxType.E2B,
                    template=self._template,
                    timeout=self._timeout_seconds,
                    envs={"CODEX_API_KEY": _codex_api_key()},
                    allow_internet_access=True,
                    pause_on_exit=True,
                    exposed_ports=(self._preview_port,),
                ),
            )
        except Exception as exc:
            _rewrite_template_resolution_error(exc)
            raise

        await session.start()
        self._session = session
        return (
            "Created the E2B Codex sandbox and materialized the workspace. "
            f"Workspace root: {self.workspace_root()}."
        )

    def _require_session(self) -> SandboxSession:
        if self._session is None:
            raise RuntimeError("Sandbox not created yet. Call `create_sandbox` first.")
        return self._session

    def workspace_root(self) -> str:
        return str(self._require_session().state.manifest.root)

    async def run_codex_task(self) -> str:
        session = self._require_session()
        quoted_workspace_root = shlex.quote(self.workspace_root())
        quoted_prompt = shlex.quote(_codex_prompt())
        result = await session.exec(
            f"codex exec --full-auto --skip-git-repo-check -C {quoted_workspace_root} {quoted_prompt}",
            timeout=self._timeout_seconds,
            shell=["bash", "-lc"],
        )
        if not result.ok():
            raise RuntimeError(
                "Codex failed inside the E2B sandbox.\n\n"
                f"stdout:\n{_decode(result.stdout) or '<empty>'}\n\n"
                f"stderr:\n{_decode(result.stderr) or '<empty>'}"
            )

        stdout_text = _decode(result.stdout) or "<empty>"
        stderr_text = _decode(result.stderr)
        if stderr_text:
            return f"stdout:\n{stdout_text}\n\nstderr:\n{stderr_text}"
        return stdout_text

    async def list_generated_files(self) -> list[str]:
        session = self._require_session()
        quoted_workspace_root = shlex.quote(self.workspace_root())
        quoted_site_dir = shlex.quote(SITE_DIR)
        result = await session.exec(
            f"cd {quoted_workspace_root} && find {quoted_site_dir} -maxdepth 2 -type f | sort",
            shell=["bash", "-lc"],
        )
        if not result.ok():
            raise RuntimeError(
                "Codex completed, but the generated site files could not be listed.\n\n"
                f"stderr:\n{_decode(result.stderr) or '<empty>'}"
            )
        return [line for line in _decode(result.stdout).splitlines() if line]

    async def start_preview(self) -> str:
        session = self._require_session()
        quoted_workspace_root = shlex.quote(self.workspace_root())
        quoted_site_dir = shlex.quote(SITE_DIR)
        result = await session.exec(
            (
                f"cd {quoted_workspace_root} && "
                f"nohup python3 -m http.server {self._preview_port} --directory {quoted_site_dir} "
                "> /tmp/codex-website-preview.log 2>&1 < /dev/null &"
            ),
            shell=["bash", "-lc"],
        )
        if not result.ok():
            raise RuntimeError(
                "The site was generated, but the preview server failed to start.\n\n"
                f"stderr:\n{_decode(result.stderr) or '<empty>'}"
            )
        return f"Started the static preview server inside the sandbox on port {self._preview_port}."

    async def preview_url(self) -> str:
        endpoint = await self._require_session().resolve_exposed_port(self._preview_port)
        return endpoint.url_for("http")

    async def close(self) -> None:
        if self._session is None:
            return
        try:
            await self._session.aclose()
        finally:
            self._session = None


def build_agent(*, model: str, workspace: E2BCodexWorkspace) -> Agent:
    @function_tool
    async def create_sandbox() -> str:
        """Create the E2B sandbox, materialize the brief, and prepare the workspace."""

        return await workspace.create_sandbox()

    @function_tool
    async def run_codex_website_task() -> str:
        """Run Codex inside the E2B sandbox to generate the website."""

        return await workspace.run_codex_task()

    @function_tool
    async def list_generated_files() -> list[str]:
        """List the generated website files under the site directory."""

        return await workspace.list_generated_files()

    @function_tool
    async def start_preview_server() -> str:
        """Start a static preview server for the generated site inside the sandbox."""

        return await workspace.start_preview()

    @function_tool
    async def get_preview_url() -> str:
        """Resolve and return the public preview URL for the exposed sandbox port."""

        return await workspace.preview_url()

    return Agent(
        name="E2B Codex Orchestrator",
        model=model,
        instructions=(
            "You orchestrate a coding workflow through tool calls. "
            "Create the sandbox first, then run the Codex website task, inspect the generated files, "
            "start the preview server, and fetch the preview URL. "
            "Do not claim success until you have called the tools needed to verify the workflow. "
            "Return a concise structured result describing the completed site."
        ),
        tools=[
            create_sandbox,
            run_codex_website_task,
            list_generated_files,
            start_preview_server,
            get_preview_url,
        ],
        output_type=WebsiteResult,
    )


async def main(*, model: str, template: str, timeout_seconds: int, preview_port: int) -> None:
    _require_env("E2B_API_KEY")
    _codex_api_key()

    workspace = E2BCodexWorkspace(
        template=template,
        timeout_seconds=timeout_seconds,
        preview_port=preview_port,
    )
    agent = build_agent(model=model, workspace=workspace)

    try:
        result = await Runner.run(
            agent,
            (
                "Create the Sunrise Bakery website by orchestrating the available tools. "
                "Use tool calls for every step and return the final structured summary."
            ),
        )
        print(result.final_output.model_dump_json(indent=2))
        print(
            "\nThis session uses pause_on_exit=True, so you can inspect or resume it from E2B "
            "after the script exits."
        )
    finally:
        await workspace.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Model name to use.")
    parser.add_argument(
        "--template",
        default=DEFAULT_TEMPLATE,
        help="E2B template name. Defaults to the pre-built `codex` template from E2B docs.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Sandbox timeout in seconds.",
    )
    parser.add_argument(
        "--preview-port",
        type=int,
        default=DEFAULT_PREVIEW_PORT,
        help="Port to expose for a static preview server inside the sandbox.",
    )
    args = parser.parse_args()

    asyncio.run(
        main(
            model=args.model,
            template=args.template,
            timeout_seconds=args.timeout,
            preview_port=args.preview_port,
        )
    )
