from __future__ import annotations

import copy
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any

import pytest

from muse_execution_backend.main import E2BExecutionBackend, run_agent


@dataclass
class CommandResult:
    exit_code: int = 0
    stdout: str = "ok"
    stderr: str = ""


class RecordingCommands:
    def __init__(self, results: list[CommandResult] | None = None) -> None:
        self.calls: list[dict[str, Any]] = []
        self.results = results or []

    def run(self, command: str, *, cwd: str, timeout: int) -> CommandResult:
        self.calls.append({"command": command, "cwd": cwd, "timeout": timeout})
        return self.results.pop(0) if self.results else CommandResult()


class RecordingFiles:
    def __init__(self) -> None:
        self.writes: list[tuple[str, str]] = []

    def write(self, path: str, content: str) -> None:
        self.writes.append((path, content))


class SandboxDouble:
    def __init__(self, results: list[CommandResult] | None = None) -> None:
        self.commands = RecordingCommands(results)
        self.files = RecordingFiles()


@dataclass
class ToolFunction:
    name: str
    arguments: str


@dataclass
class ToolCall:
    id: str
    function: ToolFunction


class AssistantMessage:
    def __init__(
        self,
        *,
        content: str | None = None,
        tool_calls: list[ToolCall] | None = None,
    ) -> None:
        self.content = content
        self.tool_calls = tool_calls or []

    def model_dump(self, *, exclude_none: bool) -> dict[str, Any]:
        payload: dict[str, Any] = {"role": "assistant"}
        if self.content is not None or not exclude_none:
            payload["content"] = self.content
        if self.tool_calls:
            payload["tool_calls"] = [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.function.name,
                        "arguments": call.function.arguments,
                    },
                }
                for call in self.tool_calls
            ]
        return payload


class QueuedCompletions:
    def __init__(self, messages: list[AssistantMessage]) -> None:
        self.messages = messages
        self.requests: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> Any:
        self.requests.append(copy.deepcopy(kwargs))
        return SimpleNamespace(
            choices=[SimpleNamespace(message=self.messages.pop(0))]
        )


class ModelClientDouble:
    def __init__(self, messages: list[AssistantMessage]) -> None:
        self.completions = QueuedCompletions(messages)
        self.chat = SimpleNamespace(completions=self.completions)


def test_run_passes_workspace_and_truncates_output() -> None:
    sandbox = SandboxDouble(
        [CommandResult(stdout="0123456789", stderr="", exit_code=0)]
    )
    backend = E2BExecutionBackend(
        sandbox,
        workspace="/home/user/project",
        command_timeout=45,
        max_tool_output_chars=4,
    )

    output = backend.run("pytest -q")

    assert sandbox.commands.calls == [
        {
            "command": "pytest -q",
            "cwd": "/home/user/project",
            "timeout": 45,
        }
    ]
    assert output == "exit_code: 0\n... (6 characters omitted) ...\n6789"


def test_write_file_keeps_paths_inside_workspace() -> None:
    sandbox = SandboxDouble()
    backend = E2BExecutionBackend(sandbox, workspace="/home/user/project")

    assert backend.write_file("src/app.py", "print('ok')") == (
        "wrote src/app.py (11 bytes)"
    )
    assert sandbox.files.writes == [
        ("/home/user/project/src/app.py", "print('ok')")
    ]

    with pytest.raises(ValueError, match="inside the workspace"):
        backend.write_file("../outside.py", "no")

    with pytest.raises(ValueError, match="relative workspace path"):
        backend.write_file("/etc/passwd", "no")


def test_clone_repository_prepares_and_checks_out_the_requested_ref() -> None:
    sandbox = SandboxDouble(
        [
            CommandResult(),
            CommandResult(),
            CommandResult(),
        ]
    )
    backend = E2BExecutionBackend(sandbox, workspace="/home/user/project")

    backend.clone_repository(
        "https://github.com/example/demo.git",
        repo_ref="v1.2.3",
    )

    assert sandbox.commands.calls == [
        {
            "command": "mkdir -p /home/user",
            "cwd": "/home/user",
            "timeout": 120,
        },
        {
            "command": (
                "git clone https://github.com/example/demo.git "
                "/home/user/project"
            ),
            "cwd": "/home/user",
            "timeout": 120,
        },
        {
            "command": "git checkout --detach v1.2.3",
            "cwd": "/home/user/project",
            "timeout": 120,
        },
    ]

    with pytest.raises(ValueError, match="HTTPS URL"):
        backend.clone_repository("git@github.com:example/demo.git")


def test_agent_loop_executes_tool_and_returns_final_summary() -> None:
    sandbox = SandboxDouble([CommandResult(stdout="1 passed", exit_code=0)])
    backend = E2BExecutionBackend(sandbox, command_timeout=30)
    client = ModelClientDouble(
        [
            AssistantMessage(
                tool_calls=[
                    ToolCall(
                        id="call_1",
                        function=ToolFunction(
                            name="run",
                            arguments='{"command":"pytest -q"}',
                        ),
                    )
                ]
            ),
            AssistantMessage(content="The targeted test passes."),
        ]
    )

    answer = run_agent(
        client,
        backend,
        task="Run the focused test.",
        model="muse-spark-1.2",
        max_steps=2,
    )

    assert answer == "The targeted test passes."
    assert sandbox.commands.calls[0]["command"] == "pytest -q"
    assert len(client.completions.requests) == 2
    assert client.completions.requests[1]["messages"][-1] == {
        "role": "tool",
        "tool_call_id": "call_1",
        "content": "exit_code: 0\n1 passed",
    }
