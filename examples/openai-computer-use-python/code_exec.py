"""Code execution on an E2B desktop, the computer-use path OpenAI recommends for gpt-6-astra.

Instead of the `computer` tool, the model gets one function tool, `exec_py`, and writes PyAutoGUI code. That code runs
in a persistent Python process inside the E2B desktop ([`exec_py_runtime.py`](exec_py_runtime.py)), never on your
machine, and returns its logs and screenshots to the model.

- `TEMPLATE` is the E2B template the desktop starts from: the stock desktop plus PyAutoGUI, built by `template.py`.
- `start_runtime` uploads the runtime to a desktop and starts it.
- `run` is the Responses loop from OpenAI's code-execution guide, with each call sent to the desktop.
"""

import json
import os
import time
from pathlib import Path

from e2b_desktop import Sandbox
from openai import OpenAI

MODEL = os.environ.get("OPENAI_MODEL", "gpt-6-astra")
TEMPLATE = "openai-computer-use-exec-py"

RUNTIME = "/home/user/.exec_py/runtime.py"
SOCKET = "/tmp/exec_py.sock"
CELL = "/home/user/.exec_py/cell.py"  # next to the runtime, which reads it on each call
CALL_TIMEOUT = 60  # seconds one exec_py call may run

# The tool definition from OpenAI's guide, plus the screen size.
TOOL = {
    "type": "function",
    "name": "exec_py",
    "description": (
        "Run Python in a persistent desktop. Variables persist across calls. "
        "PyAutoGUI operations are synchronous. Available: pyautogui, time, "
        "log(value), and display(PIL_image). Inspect the screen with "
        "display(pyautogui.screenshot()) before acting. Use screenshot "
        "coordinates and check the screen after a short group of actions. "
        "Keep screenshots in memory and PyAutoGUI's fail-safe enabled. "
        "The screen is 1280x800."
    ),
    "parameters": {
        "type": "object",
        "properties": {"code": {"type": "string"}},
        "required": ["code"],
        "additionalProperties": False,
    },
    "strict": True,
}


def start_runtime(desktop: Sandbox):
    """Upload the exec_py runtime to the desktop, start it, and wait for its socket."""
    desktop.files.write(RUNTIME, Path(__file__).with_name("exec_py_runtime.py").read_text())
    # timeout=0: a background command otherwise ends after 60 seconds. The desktop sets DISPLAY for every command.
    desktop.commands.run(f"python3 {RUNTIME}", background=True, timeout=0)
    desktop.commands.run(f"for i in $(seq 100); do [ -S {SOCKET} ] && exit 0; sleep 0.1; done; exit 1")


def exec_py(desktop: Sandbox, code: str) -> list:
    """Run one exec_py call on the desktop and return its output items."""
    desktop.files.write(CELL, code)
    result = desktop.commands.run(
        f"curl -sS --fail -m {CALL_TIMEOUT} --unix-socket {SOCKET} -X POST http://exec_py/",
        timeout=CALL_TIMEOUT + 10,
    )
    return json.loads(result.stdout)


def show(code: str, output: list):
    """Print a call's code and its text output; screenshots appear as a placeholder."""
    print("  exec_py")
    for line in code.strip().splitlines():
        print(f"    | {line}")
    for item in output:
        text = item["text"] if item["type"] == "input_text" else "[screenshot]"
        print(f"    > {text[:300]}")


def run(desktop: Sandbox, task: str, *, max_turns: int, time_limit: int) -> str:
    """Give the model a task on this desktop and return its final answer."""
    deadline = time.monotonic() + time_limit
    next_input = [{"role": "user", "content": task}]
    previous_response_id = None
    with OpenAI(timeout=120, max_retries=2) as client:
        for _ in range(max_turns):
            if time.monotonic() >= deadline:
                break
            response = client.responses.create(
                model=MODEL,
                tools=[TOOL],
                input=next_input,
                previous_response_id=previous_response_id,
                reasoning={"effort": "low"},
            )
            if response.status != "completed":
                raise RuntimeError(f"Response stopped with status: {response.status}")
            calls = [item for item in response.output if item.type == "function_call"]
            if not calls:
                return response.output_text

            next_input = []
            for call in calls:
                if call.name != "exec_py":
                    raise ValueError(f"Unexpected tool: {call.name}")
                code = json.loads(call.arguments)["code"]
                output = exec_py(desktop, code)
                show(code, output)
                next_input.append({"type": "function_call_output", "call_id": call.call_id, "output": output})
            previous_response_id = response.id
    raise RuntimeError(f"No answer within {max_turns} model calls or {time_limit} seconds.")
