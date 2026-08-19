from __future__ import annotations

import argparse
import asyncio
import json
import os
import shlex
import sys
from pathlib import Path
from typing import Any

from openai.types.responses import ResponseTextDeltaEvent

from agents import Agent, AsyncComputer, ComputerTool, ModelSettings, Runner, function_tool
from agents.computer import Button, Environment
from agents.items import ToolCallItem, ToolCallOutputItem, TResponseInputItem
from agents.run import RunConfig
from agents.sandbox import SandboxRunConfig
from agents.sandbox.session import SandboxSession

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

DEFAULT_MODEL = "gpt-5.6-terra"
DEFAULT_TEMPLATE = "e2b/openai-desktop"
DEFAULT_TIMEOUT_SECONDS = 1800
DEFAULT_DESKTOP_PORT = 6080
DEFAULT_DISPLAY = ":0"
DEFAULT_DESKTOP_USER = "user"
DEFAULT_DESKTOP_HOME = "/home/user"
DEFAULT_DIMENSIONS = (1024, 768)
EXIT_COMMANDS = {"exit", "quit"}
MAX_LOG_CHARS = 200
SCROLL_UNITS_PER_CLICK = 120
MAX_SCROLL_CLICKS = 8
BUTTON_TO_XDOTOOL = {"left": 1, "wheel": 2, "right": 3, "back": 8, "forward": 9}
KEY_ALIASES = {
    "/": "slash",
    "\\": "backslash",
    "alt": "Alt_L",
    "arrowdown": "Down",
    "arrowleft": "Left",
    "arrowright": "Right",
    "arrowup": "Up",
    "backspace": "BackSpace",
    "capslock": "Caps_Lock",
    "cmd": "Super_L",
    "ctrl": "Control_L",
    "delete": "Delete",
    "end": "End",
    "enter": "Return",
    "esc": "Escape",
    "home": "Home",
    "insert": "Insert",
    "option": "Alt_L",
    "pagedown": "Page_Down",
    "pageup": "Page_Up",
    "shift": "Shift_L",
    "space": "space",
    "super": "Super_L",
    "tab": "Tab",
    "win": "Super_L",
}


def _require_env(name: str) -> None:
    if not os.environ.get(name):
        raise SystemExit(f"{name} must be set before running this example.")


def _require_e2b_dependency() -> tuple[Any, Any, Any]:
    try:
        from agents.extensions.sandbox import (
            E2BSandboxClient,
            E2BSandboxClientOptions,
            E2BSandboxType,
        )
    except Exception as exc:  # pragma: no cover - depends on optional extras
        raise SystemExit(
            "E2B desktop examples require the optional repo extra.\n"
            "Install it with: uv sync --extra e2b"
        ) from exc

    return E2BSandboxClient, E2BSandboxClientOptions, E2BSandboxType


def _rewrite_template_resolution_error(exc: Exception) -> None:
    """Turn template lookup failures into a more actionable CLI error."""
    marker = "error resolving template '"
    message = str(exc)
    if marker not in message:
        return
    template = message.split(marker, 1)[1].split("'", 1)[0]
    raise SystemExit(
        f"E2B could not resolve template `{template}`.\n"
        "Pass `--template <your-template>` with a template that exists for this E2B account/team. "
        "This example defaults to `e2b/openai-desktop`."
    ) from exc


def truncate_for_log(value: str, *, max_chars: int = MAX_LOG_CHARS) -> str:
    compact = " ".join(value.split())
    if len(compact) <= max_chars:
        return compact
    return f"{compact[: max_chars - 3]}..."


def map_key_name(key: str) -> str:
    return KEY_ALIASES.get(key.lower(), key)


def xdotool_keyspec(keys: list[str]) -> str:
    return "+".join(map_key_name(key) for key in keys)


def scroll_clicks(amount: int) -> int:
    if amount == 0:
        return 0
    return min(
        (abs(amount) + SCROLL_UNITS_PER_CLICK - 1) // SCROLL_UNITS_PER_CLICK, MAX_SCROLL_CLICKS
    )


def _get(raw_item: object, name: str) -> Any:
    if isinstance(raw_item, dict):
        return raw_item.get(name)
    return getattr(raw_item, name, None)


def _get_type(raw_item: object) -> str:
    raw_type = _get(raw_item, "type")
    return raw_type if isinstance(raw_type, str) else ""


def _format_tool_arguments(arguments: str | None) -> str:
    if not arguments:
        return ""
    try:
        parsed = json.loads(arguments)
    except json.JSONDecodeError:
        return truncate_for_log(arguments)
    return truncate_for_log(json.dumps(parsed, separators=(",", ":"), ensure_ascii=True))


def _describe_computer_action(action: object) -> str:
    action_type = _get_type(action)
    if action_type == "click":
        return (
            f"click({_get(action, 'x')}, {_get(action, 'y')}, {_get(action, 'button') or 'left'})"
        )
    if action_type in {"double_click", "move"}:
        return f"{action_type}({_get(action, 'x')}, {_get(action, 'y')})"
    if action_type == "drag":
        path = _get(action, "path") or []
        return f"drag(points={len(path)})"
    if action_type == "keypress":
        keys = _get(action, "keys") or []
        return f"keypress({'+'.join(str(key) for key in keys)})"
    if action_type == "scroll":
        return (
            f"scroll(x={_get(action, 'x')}, y={_get(action, 'y')}, "
            f"scroll_x={_get(action, 'scroll_x')}, scroll_y={_get(action, 'scroll_y')})"
        )
    if action_type == "type":
        return f"type({truncate_for_log(str(_get(action, 'text') or ''), max_chars=80)})"
    return action_type or "computer"


def describe_tool_call(item: ToolCallItem) -> str:
    raw_type = _get_type(item.raw_item)
    if raw_type == "computer_call":
        actions = _get(item.raw_item, "actions") or []
        if not actions and _get(item.raw_item, "action") is not None:
            actions = [_get(item.raw_item, "action")]
        return "computer " + ", ".join(_describe_computer_action(action) for action in actions)

    name = _get(item.raw_item, "name")
    arguments = _get(item.raw_item, "arguments")
    if isinstance(name, str) and name:
        formatted = _format_tool_arguments(arguments if isinstance(arguments, str) else None)
        return f"{name} {formatted}".strip()
    return raw_type or "tool"


def describe_tool_output(item: ToolCallOutputItem) -> str:
    if _get_type(item.raw_item) == "computer_call_output":
        output = item.output if isinstance(item.output, str) else ""
        if output.startswith("data:image/png;base64,"):
            return f"computer screenshot ({len(output.split(',', 1)[1])} base64 chars)"
        return "computer screenshot"
    if isinstance(item.output, str):
        return truncate_for_log(item.output)
    return truncate_for_log(repr(item.output))


def _format_exec_result(*, exit_code: int, stdout: bytes, stderr: bytes) -> str:
    stdout_text = stdout.decode("utf-8", errors="replace").strip() or "<empty>"
    stderr_text = stderr.decode("utf-8", errors="replace").strip() or "<empty>"
    return f"exit_code: {exit_code}\nstdout:\n{stdout_text}\nstderr:\n{stderr_text}"


class DesktopComputer(AsyncComputer):
    """Bridge the SDK computer interface to the live X11 desktop inside the sandbox."""

    def __init__(self, session: SandboxSession) -> None:
        self.session = session
        self.dimensions_value = DEFAULT_DIMENSIONS

    @property
    def environment(self) -> Environment:
        return "ubuntu"

    @property
    def dimensions(self) -> tuple[int, int]:
        return self.dimensions_value

    async def prime(self) -> None:
        try:
            geometry = await self.exec("xdotool getdisplaygeometry", timeout=10)
        except Exception:
            return
        parts = geometry.split()
        if len(parts) == 2 and all(part.isdigit() for part in parts):
            self.dimensions_value = (int(parts[0]), int(parts[1]))

    async def screenshot(self) -> str:
        return await self.exec(
            """
set -euo pipefail
shot_path="$(mktemp /tmp/e2b-desktop-shot.XXXXXX.png)"
xfce4-screenshooter -f -s "$shot_path" >/dev/null 2>&1 || scrot -z "$shot_path" >/dev/null 2>&1
[ -s "$shot_path" ] || {
    echo "Screenshot failed." >&2
    exit 1
}
base64 < "$shot_path" | tr -d '\\n'
rm -f "$shot_path"
""".strip(),
            timeout=20,
        )

    async def click(self, x: int, y: int, button: Button) -> None:
        await self.exec(f"xdotool mousemove --sync {x} {y} click {BUTTON_TO_XDOTOOL[button]}")

    async def double_click(self, x: int, y: int) -> None:
        await self.exec(f"xdotool mousemove --sync {x} {y} click --repeat 2 --delay 120 1")

    async def scroll(self, x: int, y: int, scroll_x: int, scroll_y: int) -> None:
        commands = [f"xdotool mousemove --sync {x} {y}"]
        # OpenAI computer scroll deltas are much larger than a single X11 wheel notch.
        # Convert them into a few discrete wheel clicks because large `xdotool --repeat`
        # values can hang in this desktop template.
        if vertical_clicks := scroll_clicks(scroll_y):
            commands.extend(
                f"xdotool click {4 if scroll_y > 0 else 5}" for _ in range(vertical_clicks)
            )
        if horizontal_clicks := scroll_clicks(scroll_x):
            commands.extend(
                f"xdotool click {7 if scroll_x > 0 else 6}" for _ in range(horizontal_clicks)
            )
        await self.exec("\n".join(commands))

    async def type(self, text: str) -> None:
        await self.exec(f"xdotool type --delay 25 -- {shlex.quote(text)}")

    async def wait(self) -> None:
        await self.exec("sleep 1")

    async def move(self, x: int, y: int) -> None:
        await self.exec(f"xdotool mousemove --sync {x} {y}")

    async def keypress(self, keys: list[str]) -> None:
        await self.exec(f"xdotool key --clearmodifiers {shlex.quote(xdotool_keyspec(keys))}")

    async def drag(self, path: list[tuple[int, int]]) -> None:
        if not path:
            return
        commands = [f"xdotool mousemove --sync {path[0][0]} {path[0][1]}", "xdotool mousedown 1"]
        commands.extend(f"xdotool mousemove --sync {x} {y}" for x, y in path[1:])
        commands.append("xdotool mouseup 1")
        await self.exec("\n".join(commands))

    async def exec(self, command: str, *, timeout: int = 30) -> str:
        result = await self.session.exec(
            self.wrap(command),
            timeout=timeout,
            shell=["bash", "-lc"],
            user=DEFAULT_DESKTOP_USER,
        )
        if not result.ok():
            raise RuntimeError(
                _format_exec_result(
                    exit_code=result.exit_code,
                    stdout=result.stdout,
                    stderr=result.stderr,
                )
            )
        return result.stdout.decode("utf-8", errors="replace").strip()

    @staticmethod
    def wrap(command: str) -> str:
        """Prefix commands with the desktop session's X11 environment variables."""
        return (
            f"export DISPLAY={shlex.quote(DEFAULT_DISPLAY)}\n"
            f"export HOME={shlex.quote(DEFAULT_DESKTOP_HOME)}\n"
            f"export XAUTHORITY={shlex.quote(DEFAULT_DESKTOP_HOME)}/.Xauthority\n"
            f"{command}"
        )


def build_agent(model: str, session: SandboxSession, computer: DesktopComputer) -> Agent:
    """Create the assistant with a shell tool and the live desktop computer tool."""

    @function_tool
    async def shell_command(command: str, timeout_seconds: int = 10) -> str:
        """Run a short command inside the desktop sandbox."""

        result = await session.exec(
            computer.wrap(command),
            timeout=timeout_seconds,
            shell=["bash", "-lc"],
            user=DEFAULT_DESKTOP_USER,
        )
        return _format_exec_result(
            exit_code=result.exit_code,
            stdout=result.stdout,
            stderr=result.stderr,
        )

    instructions = (
        "You control a live Ubuntu desktop in an E2B sandbox. "
        "Use `shell_command` to launch apps or inspect the system. "
        "Use the computer tool for GUI interaction. "
        "Keep answers concise, and say clearly when you are blocked."
    )
    return Agent(
        name="E2B Desktop Assistant",
        model=model,
        instructions=instructions,
        tools=[shell_command, ComputerTool(computer=computer)],
        model_settings=ModelSettings(parallel_tool_calls=False),
    )


async def run_repl(agent: Agent, run_config: RunConfig) -> None:
    """Run the streaming terminal REPL and preserve conversation state between turns."""
    history: list[TResponseInputItem] = []
    turn = 1
    while True:
        try:
            prompt = await asyncio.to_thread(input, f"user[{turn}]> ")
        except EOFError:
            print()
            return

        prompt = prompt.strip()
        if not prompt:
            continue
        if prompt.lower() in EXIT_COMMANDS:
            return

        print(f"[turn {turn}] user: {prompt}")
        history.append({"role": "user", "content": prompt})
        result = Runner.run_streamed(agent, history, run_config=run_config)
        streaming_text = False
        saw_text = False

        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(
                event.data, ResponseTextDeltaEvent
            ):
                if not streaming_text:
                    print("assistant> ", end="", flush=True)
                    streaming_text = True
                print(event.data.delta, end="", flush=True)
                saw_text = True
                continue

            if event.type != "run_item_stream_event":
                continue

            if streaming_text:
                print()
                streaming_text = False

            if event.name == "tool_called" and isinstance(event.item, ToolCallItem):
                print(f"[tool call] {describe_tool_call(event.item)}")
            elif event.name == "tool_output" and isinstance(event.item, ToolCallOutputItem):
                print(f"[tool output] {describe_tool_output(event.item)}")

        if streaming_text:
            print()
        if not saw_text and result.final_output:
            print(f"assistant> {result.final_output}")

        history = result.to_input_list()
        turn += 1


async def main(model: str, template: str, timeout_seconds: int, desktop_port: int) -> None:
    """Create the sandbox session, print connection info, and hand off to the REPL."""
    _require_env("OPENAI_API_KEY")
    _require_env("E2B_API_KEY")

    E2BSandboxClient, E2BSandboxClientOptions, E2BSandboxType = _require_e2b_dependency()
    client = E2BSandboxClient()
    try:
        session = await client.create(
            options=E2BSandboxClientOptions(
                sandbox_type=E2BSandboxType.E2B,
                template=template,
                timeout=timeout_seconds,
                allow_internet_access=True,
                exposed_ports=(desktop_port,),
            )
        )
    except Exception as exc:
        _rewrite_template_resolution_error(exc)
        raise

    try:
        await session.start()
        endpoint = await session.resolve_exposed_port(desktop_port)
        computer = DesktopComputer(session)
        await computer.prime()

        print(f"sandbox> id: {getattr(session, 'sandbox_id', None)}")
        print(f"sandbox> noVNC: {endpoint.url_for('http')}")
        print(f"sandbox> display size: {computer.dimensions[0]}x{computer.dimensions[1]}")
        print("sandbox> type `exit` or `quit` to stop the session.")

        await run_repl(
            build_agent(model, session, computer),
            RunConfig(
                sandbox=SandboxRunConfig(session=session),
                workflow_name="E2B desktop REPL example",
            ),
        )
    finally:
        await session.aclose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Start an interactive E2B desktop REPL backed by an OpenAI agent.",
        epilog="Example: python desktop_repl.py --template e2b/openai-desktop",
    )
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Model name to use.")
    parser.add_argument("--template", default=DEFAULT_TEMPLATE, help="E2B template to use.")
    parser.add_argument(
        "--timeout-seconds",
        default=DEFAULT_TIMEOUT_SECONDS,
        type=int,
        help="Sandbox timeout in seconds.",
    )
    parser.add_argument(
        "--desktop-port",
        default=DEFAULT_DESKTOP_PORT,
        type=int,
        help="Desktop noVNC port exposed from the sandbox.",
    )
    args = parser.parse_args()
    asyncio.run(main(args.model, args.template, args.timeout_seconds, args.desktop_port))
