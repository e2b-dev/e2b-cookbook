"""E2B sandbox access for the graph: run-scoped context plus the tools the executor agent uses.

The live ``Sandbox`` handle travels in LangGraph *runtime context*, never in graph
state. State is checkpointed and must be serialisable; context is rebuilt by the
caller on every invoke (see ``main.py`` for the resume path).
"""

from __future__ import annotations

from dataclasses import dataclass

from e2b import CommandExitException, FileNotFoundException, Sandbox
from langchain.tools import ToolRuntime, tool
from langchain_core.language_models import BaseChatModel

REPO_DIR = "/home/user/repo"
PYTEST = "python -m pytest -q --no-header -p no:cacheprovider"


@dataclass
class RunContext:
    """Run-scoped dependencies. Not serialisable, not checkpointed."""

    sandbox: Sandbox
    model: BaseChatModel


def run_tests(sandbox: Sandbox) -> tuple[int, str]:
    """Run the fixture's pytest suite; return (exit_code, combined output)."""
    try:
        result = sandbox.commands.run(PYTEST, cwd=REPO_DIR, timeout=120)
    except CommandExitException as failed:  # non-zero exit — the SDK raises
        result = failed
    return result.exit_code, result.stdout + result.stderr


@tool
def read_file(path: str, runtime: ToolRuntime[RunContext]) -> str:
    """Read a repository file. `path` is relative to the repository root."""
    try:
        return runtime.context.sandbox.files.read(f"{REPO_DIR}/{path}")
    except FileNotFoundException:
        # Tell the model, don't crash the graph: a wrong guess is routine.
        return f"error: no such file: {path}"


@tool
def write_file(path: str, content: str, runtime: ToolRuntime[RunContext]) -> str:
    """Overwrite a repository file with `content`. `path` is relative to the repository root."""
    runtime.context.sandbox.files.write(f"{REPO_DIR}/{path}", content)
    return f"wrote {path}"


@tool
def run_command(command: str, runtime: ToolRuntime[RunContext]) -> str:
    """Run a shell command in the repository root. Returns exit code, stdout and stderr."""
    try:
        result = runtime.context.sandbox.commands.run(
            command, cwd=REPO_DIR, timeout=120
        )
    except CommandExitException as failed:
        result = failed
    return f"exit code: {result.exit_code}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
