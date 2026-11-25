"""Run OpenAdapt inside an E2B sandbox for verified writes and zero-model-call replay."""

from __future__ import annotations

import os
import shlex
import sys
from collections.abc import Callable, Mapping
from typing import Any, Protocol

from e2b import CommandExitException, Sandbox

SANDBOX_TIMEOUT = 600
COMMAND_TIMEOUT = 300
RUN_METADATA = {"example": "openadapt-verified-agent-python"}
INSTALL_UV_CMD = (
    "command -v uv >/dev/null 2>&1 || "
    "(curl -LsSf https://astral.sh/uv/install.sh | sh)"
)
UV_PATH_PREFIX = 'export PATH="$HOME/.local/bin:$PATH"'


class CommandResult(Protocol):
    exit_code: int
    stdout: str
    stderr: str


class SandboxLike(Protocol):
    commands: Any

    def kill(self) -> None: ...


SandboxFactory = Callable[..., SandboxLike]


def resolve_settings(environment: Mapping[str, str]) -> tuple[str, dict[str, str]]:
    """Validate required keys and choose between wrap --example and quickstart."""
    if not environment.get("E2B_API_KEY"):
        raise RuntimeError(
            "Missing E2B_API_KEY. Copy .env.example to .env and export E2B_API_KEY."
        )

    anthropic_key = environment.get("ANTHROPIC_API_KEY", "").strip()
    if anthropic_key:
        return "wrap-example", {"ANTHROPIC_API_KEY": anthropic_key}

    return "quickstart", {}


def build_openadapt_command(mode: str, out_dir: str) -> str:
    """Build the OpenAdapt CLI command to run inside the sandbox."""
    if mode == "wrap-example":
        args = [
            "uvx",
            "--python",
            "3.12",
            "openadapt",
            "wrap",
            "--example",
            "--json",
            "--out",
            out_dir,
        ]
    elif mode == "quickstart":
        args = [
            "uvx",
            "--python",
            "3.12",
            "openadapt",
            "quickstart",
            "--out",
            out_dir,
        ]
    else:
        raise ValueError(f"Unsupported mode: {mode}")

    return f"{UV_PATH_PREFIX} && {shlex.join(args)}"


def run_demo(
    environment: Mapping[str, str] | None = None,
    sandbox_factory: SandboxFactory = Sandbox.create,
) -> str:
    """Create an E2B sandbox, run OpenAdapt, and always clean up the sandbox."""
    env = os.environ if environment is None else environment
    mode, sandbox_envs = resolve_settings(env)
    out_dir = (
        "/home/user/openadapt-wrap"
        if mode == "wrap-example"
        else "/home/user/openadapt-quickstart"
    )

    sandbox = sandbox_factory(
        timeout=SANDBOX_TIMEOUT,
        envs=sandbox_envs,
        metadata=RUN_METADATA,
    )
    try:
        print("Ensuring uv is installed in the E2B sandbox...")
        sandbox.commands.run(INSTALL_UV_CMD, timeout=120)

        cmd = build_openadapt_command(mode, out_dir)
        print(f"Running OpenAdapt ({mode}) inside the sandbox...")
        result = sandbox.commands.run(cmd, timeout=COMMAND_TIMEOUT)
        output = (result.stdout or "").strip()
        if output:
            print(output)
        return output
    except CommandExitException as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        raise RuntimeError(
            f"OpenAdapt command failed in E2B sandbox (exit {exc.exit_code}): {detail}"
        ) from exc
    finally:
        sandbox.kill()


def main() -> int:
    try:
        run_demo()
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
