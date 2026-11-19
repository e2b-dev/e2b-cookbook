"""Hello world with code execution: the same task as 1-run.py, done the way OpenAI recommends for gpt-6-astra.

The file manager shows a folder with two orders. gpt-6-astra gets one tool, exec_py, and writes PyAutoGUI code that
runs inside the E2B desktop to open the priority order and read back its order number while you watch live. The
number is generated here and never sent in the prompt, so the answer is checked.

Build the template once with `uv run --env-file .env template.py`, then:

    uv run --env-file .env 1-run-code-exec.py
"""

import secrets
import sys
from pathlib import Path

from e2b_desktop import Sandbox

from code_exec import MODEL, TEMPLATE, run, start_runtime
from e2b_driver import hold_open, live_view

FOLDER = "/home/user/orders"
TASK = (
    "The file manager on this desktop shows a folder. Using the mouse and keyboard, open priority-order.txt and "
    "return only its order number. Do not open other files."
)

desktop = Sandbox.create(
    template=TEMPLATE,
    resolution=(1280, 800),  # screenshots are sent at this size, which fits the model's image limits
    timeout=300,
    network={"deny_out": ["0.0.0.0/0"]},  # no internet: this task needs none
)
try:
    live_view(desktop)
    print(f"Task ({MODEL}, exec_py): {TASK}\n")

    order_number = secrets.token_hex(6).upper()
    desktop.files.write(f"{FOLDER}/priority-order.txt", f"Order number: {order_number}\nPriority: high\n")
    desktop.files.write(f"{FOLDER}/standard-order.txt", "Order number: STANDARD-1001\nPriority: standard\n")
    desktop.open(FOLDER)
    start_runtime(desktop)
    desktop.wait(3000)

    answer = run(desktop, TASK, max_turns=20, time_limit=180)
    print(f"\nAnswer: {answer}")
    correct = answer.strip() == order_number
    if correct:
        print("Correct.")
    else:
        print(f"Wrong: the order number is {order_number}.", file=sys.stderr)

    Path("output").mkdir(exist_ok=True)
    Path("output/1-run-code-exec.png").write_bytes(desktop.screenshot())
    print("Final screen saved to output/1-run-code-exec.png")
    hold_open()
finally:
    desktop.kill()
sys.exit(0 if correct else 1)
