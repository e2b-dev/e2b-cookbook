"""The E2B side of OpenAI computer use, shared by the numbered examples.

- `E2BDriver` is the driver `openai.lib.computer.ComputerToolset` asks for: it turns every action the `computer` tool
  can emit into xdotool calls on an E2B desktop, and returns screenshots.
- `live_view` starts the desktop stream and opens it in your browser so you can watch.
- `run` is the helper's loop with a deadline, logging every action to the terminal.
"""

import base64
import os
import shlex
import sys
import time
import webbrowser

from e2b_desktop import Sandbox
from e2b_desktop.main import map_key
from openai import OpenAI
from openai.lib.computer import ComputerToolset

MODEL = os.environ.get("OPENAI_MODEL", "gpt-6-luna")

# OpenAI key names that e2b_desktop's map_key does not cover.
KEYS = {"arrowup": "Up", "arrowdown": "Down", "arrowleft": "Left", "arrowright": "Right",
        "pageup": "Page_Up", "pagedown": "Page_Down", "return": "Return"}
# Punctuation as X keysyms; key names are also shell-quoted, so no key can break the command.
PUNCTUATION = {";": "semicolon", ":": "colon", "'": "apostrophe", '"': "quotedbl", ",": "comma", ".": "period",
               "/": "slash", "\\": "backslash", "|": "bar", "?": "question", "!": "exclam", "@": "at",
               "#": "numbersign", "$": "dollar", "%": "percent", "^": "asciicircum", "&": "ampersand",
               "*": "asterisk", "(": "parenleft", ")": "parenright", "-": "minus", "_": "underscore", "=": "equal",
               "+": "plus", "[": "bracketleft", "]": "bracketright", "{": "braceleft", "}": "braceright",
               "<": "less", ">": "greater", "`": "grave", "~": "asciitilde", " ": "space"}
BUTTONS = {"left": 1, "wheel": 2, "right": 3, "back": 8, "forward": 9}


def xkey(name: str) -> str:
    return PUNCTUATION.get(name) or KEYS.get(name.lower()) or map_key(name)


class E2BDriver:
    """ComputerDriver for the OpenAI helper: each action becomes one xdotool call on the E2B desktop."""

    def __init__(self, desktop: Sandbox):
        self.desktop = desktop

    def _xdotool(self, keys, *commands: str):
        # Modifier keys held during a click, drag, move or scroll.
        mods = [shlex.quote(xkey(k)) for k in keys or []]
        self.desktop.commands.run("xdotool " + " ".join(
            [f"keydown {m}" for m in mods] + list(commands) + [f"keyup {m}" for m in reversed(mods)]))

    def screenshot(self, *, cancelled=None):
        raw = self.desktop.screenshot()
        return {"type": "computer_screenshot",
                "image_url": "data:image/png;base64," + base64.b64encode(raw).decode("ascii")}

    def click(self, action, *, cancelled=None):
        self._xdotool(action.keys, f"mousemove --sync {action.x} {action.y}", f"click {BUTTONS[action.button]}")

    def double_click(self, action, *, cancelled=None):
        self._xdotool(action.keys, f"mousemove --sync {action.x} {action.y}", "click --repeat 2 1")

    def drag(self, action, *, cancelled=None):
        first, *rest = action.path
        self._xdotool(action.keys, f"mousemove --sync {first.x} {first.y}", "mousedown 1",
                      *[f"mousemove --sync {p.x} {p.y}" for p in rest], "mouseup 1")

    def move(self, action, *, cancelled=None):
        self._xdotool(action.keys, f"mousemove --sync {action.x} {action.y}")

    def scroll(self, action, *, cancelled=None):
        # The tool reports pixels; one wheel click scrolls roughly 100.
        clicks = []
        if action.scroll_y:
            clicks.append(f"click --repeat {max(1, abs(action.scroll_y) // 100)} {5 if action.scroll_y > 0 else 4}")
        if action.scroll_x:
            clicks.append(f"click --repeat {max(1, abs(action.scroll_x) // 100)} {7 if action.scroll_x > 0 else 6}")
        self._xdotool(action.keys, f"mousemove --sync {action.x} {action.y}", *clicks)

    def keypress(self, action, *, cancelled=None):
        self.desktop.commands.run("xdotool key " + shlex.quote("+".join(xkey(k) for k in action.keys)))

    def type(self, action, *, cancelled=None):
        self.desktop.write(action.text)

    def wait(self, action, *, cancelled=None):
        time.sleep(2)


def live_view(desktop: Sandbox) -> str:
    """Start a view-only, password-protected stream of the desktop and open it in your browser."""
    desktop.stream.start(require_auth=True)
    url = desktop.stream.get_url(auth_key=desktop.stream.get_auth_key(), view_only=True)
    print(f"Watch live: {url}")
    if sys.stdout.isatty():
        webbrowser.open(url)
    return url


def log(action) -> bool:
    """before_action: print each action as it runs, and allow it."""
    fields = action.model_dump(exclude_none=True)
    kind = fields.pop("type")
    if "x" in fields:
        fields["at"] = f"({fields.pop('x')}, {fields.pop('y')})"
    print(f"  {kind:<12} " + "  ".join(f"{k}={v}" for k, v in fields.items()).rstrip())
    return True


def run(desktop: Sandbox, task: str, *, max_steps: int, time_limit: int) -> str:
    """Give the model a task on this desktop and return its final answer."""
    deadline = time.monotonic() + time_limit
    with OpenAI(timeout=120, max_retries=2) as client:
        response = ComputerToolset(E2BDriver(desktop)).run(
            client,
            {"model": MODEL, "store": False, "tools": [{"type": "computer"}],
             "input": [{"role": "user", "content": task}]},
            max_steps=max_steps,  # model calls, including the final answer
            cancelled=lambda: time.monotonic() >= deadline,
            before_action=log,
            # Unattended demo on a throwaway desktop: approve the model's safety checks instead of asking a human.
            approve_safety_checks=lambda call: True,
        )
    return response.output_text


def hold_open():
    """In a terminal, wait for Enter so the live view stays up; otherwise continue at once."""
    if sys.stdin.isatty():
        input("\nPress Enter to close the desktop.")
