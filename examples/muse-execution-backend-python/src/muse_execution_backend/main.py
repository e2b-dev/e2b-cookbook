"""Run Meta's Muse Spark agent with E2B as its sandboxed execution backend.

The model loop and API credentials stay in the caller process. The model gets
only two tools, both backed by one ephemeral E2B sandbox: run and write_file.
"""

from __future__ import annotations

import argparse
import json
import os
import posixpath
import shlex
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from dotenv import load_dotenv
from e2b import Sandbox
from openai import OpenAI

DEFAULT_BASE_URL = "https://api.meta.ai/v1"
DEFAULT_MODEL = "muse-spark-1.2"
DEFAULT_WORKSPACE = "/home/user/project"
DEFAULT_COMMAND_TIMEOUT_SECONDS = 120
DEFAULT_MAX_TOOL_OUTPUT_CHARS = 12_000

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "run",
            "description": (
                "Run one shell command inside the E2B sandbox workspace. "
                "Use this to inspect files, install dependencies, edit files, and run tests."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "A shell command to run from the repository workspace.",
                    }
                },
                "required": ["command"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": (
                "Create or replace one text file inside the E2B sandbox workspace. "
                "The path must be relative to the repository workspace."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path from the repository workspace.",
                    },
                    "content": {
                        "type": "string",
                        "description": "Complete replacement content for the file.",
                    },
                },
                "required": ["path", "content"],
                "additionalProperties": False,
            },
        },
    },
]


def _truncate_for_model(text: str, limit: int) -> str:
    """Keep the most recent command output while preserving the truncation signal."""
    if len(text) <= limit:
        return text

    omitted = len(text) - limit
    return f"... ({omitted} characters omitted) ...\n{text[-limit:]}"


@dataclass(frozen=True)
class CommandExecution:
    exit_code: int
    output: str


class E2BExecutionBackend:
    """Persistent sandbox lifecycle and tool implementations for one agent run."""

    def __init__(
        self,
        sandbox: Any,
        *,
        workspace: str = DEFAULT_WORKSPACE,
        command_timeout: int = DEFAULT_COMMAND_TIMEOUT_SECONDS,
        max_tool_output_chars: int = DEFAULT_MAX_TOOL_OUTPUT_CHARS,
    ) -> None:
        if not workspace.startswith("/"):
            raise ValueError("workspace must be an absolute sandbox path")

        self.sandbox = sandbox
        self.workspace = workspace.rstrip("/")
        self.command_timeout = command_timeout
        self.max_tool_output_chars = max_tool_output_chars

    def clone_repository(self, repo_url: str, repo_ref: str | None = None) -> None:
        """Clone a caller-selected public repository before the model starts."""
        if not repo_url.startswith("https://"):
            raise ValueError("repo_url must be an HTTPS URL")

        parent = posixpath.dirname(self.workspace)
        self._raise_if_failed(
            self._execute(f"mkdir -p {shlex.quote(parent)}", cwd=parent),
            "creating the sandbox workspace",
        )
        self._raise_if_failed(
            self._execute(
                f"git clone {shlex.quote(repo_url)} {shlex.quote(self.workspace)}",
                cwd=parent,
            ),
            "cloning the repository",
        )

        if repo_ref:
            self._raise_if_failed(
                self._execute(
                    f"git checkout --detach {shlex.quote(repo_ref)}",
                    cwd=self.workspace,
                ),
                f"checking out {repo_ref}",
            )

    def run(self, command: str) -> str:
        """Run a model-selected command from the isolated repository workspace."""
        if not command.strip():
            return "tool error: command must not be empty"

        return self._render_execution(self._execute(command, cwd=self.workspace))

    def write_file(self, path: str, content: str) -> str:
        """Write a model-selected file while keeping it inside the workspace."""
        remote_path = self._workspace_file_path(path)
        self.sandbox.files.write(remote_path, content)
        return f"wrote {path} ({len(content.encode('utf-8'))} bytes)"

    def dispatch(self, name: str, arguments: Mapping[str, Any]) -> str:
        """Dispatch one tool call without exposing the sandbox object to the model."""
        if name == "run":
            command = arguments.get("command")
            if not isinstance(command, str):
                return "tool error: run requires a string command"
            return self.run(command)

        if name == "write_file":
            path = arguments.get("path")
            content = arguments.get("content")
            if not isinstance(path, str) or not isinstance(content, str):
                return "tool error: write_file requires string path and content"
            return self.write_file(path, content)

        return f"tool error: unknown tool {name}"

    def _execute(self, command: str, *, cwd: str) -> CommandExecution:
        result = self.sandbox.commands.run(
            command,
            cwd=cwd,
            timeout=self.command_timeout,
        )
        stdout = getattr(result, "stdout", "") or ""
        stderr = getattr(result, "stderr", "") or ""
        output = "\n".join(part for part in (stdout, stderr) if part).strip()
        return CommandExecution(
            exit_code=int(getattr(result, "exit_code", -1)),
            output=output or "(no output)",
        )

    def _render_execution(self, execution: CommandExecution) -> str:
        output = _truncate_for_model(
            execution.output,
            self.max_tool_output_chars,
        )
        return f"exit_code: {execution.exit_code}\n{output}"

    def _raise_if_failed(self, execution: CommandExecution, context: str) -> None:
        if execution.exit_code != 0:
            raise RuntimeError(
                f"{context} failed:\n{self._render_execution(execution)}"
            )

    def _workspace_file_path(self, path: str) -> str:
        if not path or path.startswith("/"):
            raise ValueError("path must be a non-empty relative workspace path")

        normalized = posixpath.normpath(path)
        if normalized in {".", ".."} or normalized.startswith("../"):
            raise ValueError("path must stay inside the workspace")

        return posixpath.join(self.workspace, normalized)


def _system_prompt(workspace: str) -> str:
    return f"""You are a coding agent working inside an isolated E2B sandbox.
The repository workspace is {workspace}. You have exactly two tools: run and
write_file. Every command and file change must stay in that workspace.

Work like an engineer: inspect the code, make the smallest correct change, and
run targeted tests before reporting completion. Do not assume access to the
caller machine, its filesystem, or its credentials. The model API key is not
available inside the sandbox."""


def _message_as_dict(message: Any) -> dict[str, Any]:
    """Convert an SDK message to the Chat Completions request shape."""
    model_dump = getattr(message, "model_dump", None)
    if callable(model_dump):
        return model_dump(exclude_none=True)

    payload: dict[str, Any] = {"role": "assistant"}
    content = getattr(message, "content", None)
    if content is not None:
        payload["content"] = content

    tool_calls = getattr(message, "tool_calls", None) or []
    if tool_calls:
        payload["tool_calls"] = [
            {
                "id": tool_call.id,
                "type": "function",
                "function": {
                    "name": tool_call.function.name,
                    "arguments": tool_call.function.arguments,
                },
            }
            for tool_call in tool_calls
        ]

    return payload


def _run_tool_call(backend: E2BExecutionBackend, tool_call: Any) -> str:
    try:
        arguments = json.loads(tool_call.function.arguments or "{}")
    except json.JSONDecodeError as error:
        return f"tool error: invalid JSON arguments: {error.msg}"

    if not isinstance(arguments, dict):
        return "tool error: tool arguments must be a JSON object"

    try:
        return backend.dispatch(tool_call.function.name, arguments)
    except Exception as error:
        return f"tool error: {error}"


def run_agent(
    client: Any,
    backend: E2BExecutionBackend,
    *,
    task: str,
    model: str,
    max_steps: int,
) -> str:
    """Run the model loop until it returns a final answer or reaches its limit."""
    if max_steps < 1:
        raise ValueError("max_steps must be at least 1")

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _system_prompt(backend.workspace)},
        {"role": "user", "content": task},
    ]

    for _ in range(max_steps):
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        message = response.choices[0].message
        messages.append(_message_as_dict(message))
        tool_calls = getattr(message, "tool_calls", None) or []

        if not tool_calls:
            return message.content or "(The model returned no final summary.)"

        for tool_call in tool_calls:
            tool_result = _run_tool_call(backend, tool_call)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": tool_result,
                }
            )

    raise RuntimeError(f"agent exceeded the configured {max_steps}-step limit")


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Use E2B as the execution backend for a Muse Spark coding agent."
    )
    parser.add_argument(
        "--repo-url",
        required=True,
        help="Public HTTPS repository URL to clone into the sandbox.",
    )
    parser.add_argument(
        "--repo-ref",
        help="Optional branch, tag, or commit to check out after cloning.",
    )
    parser.add_argument(
        "--task",
        required=True,
        help="Coding task for the model to complete in the cloned repository.",
    )
    parser.add_argument(
        "--template",
        help="Optional E2B template ID for the sandbox environment.",
    )
    parser.add_argument(
        "--sandbox-timeout",
        type=int,
        default=600,
        help="Sandbox lifetime in seconds. Defaults to 600.",
    )
    parser.add_argument(
        "--command-timeout",
        type=int,
        default=DEFAULT_COMMAND_TIMEOUT_SECONDS,
        help="Maximum duration of one sandbox command in seconds.",
    )
    parser.add_argument(
        "--max-steps",
        type=int,
        default=20,
        help="Maximum model tool-loop iterations. Defaults to 20.",
    )
    return parser.parse_args(argv)


def _create_model_client() -> OpenAI:
    api_key = os.environ.get("META_API_KEY")
    if not api_key:
        raise RuntimeError("META_API_KEY is required")

    return OpenAI(
        api_key=api_key,
        base_url=os.environ.get("META_BASE_URL", DEFAULT_BASE_URL),
    )


def _create_sandbox(template: str | None, timeout: int) -> Sandbox:
    options: dict[str, Any] = {"timeout": timeout}
    if template:
        options["template"] = template
    return Sandbox.create(**options)


def main(argv: Sequence[str] | None = None) -> None:
    load_dotenv()
    args = _parse_args(argv)
    sandbox: Sandbox | None = None

    try:
        sandbox = _create_sandbox(args.template, args.sandbox_timeout)
        backend = E2BExecutionBackend(
            sandbox,
            command_timeout=args.command_timeout,
        )
        backend.clone_repository(args.repo_url, args.repo_ref)

        print(f"Sandbox created: {sandbox.sandbox_id}")
        print(f"Repository ready at {backend.workspace}")
        final_answer = run_agent(
            _create_model_client(),
            backend,
            task=args.task,
            model=os.environ.get("META_MODEL", DEFAULT_MODEL),
            max_steps=args.max_steps,
        )
        print("\nAgent summary:\n")
        print(final_answer)
    finally:
        if sandbox is not None:
            sandbox.kill()


if __name__ == "__main__":
    main()
