"""Hello world: OpenAI computer use on an E2B desktop, the task from OpenAI's guide.

The file manager shows a folder with two orders. gpt-6-luna opens the priority one and reads back its order number
while you watch live. The number is generated here and never sent in the prompt, so the answer is checked.

    uv run --env-file .env 1-run.py
"""

import secrets
from pathlib import Path

from e2b_desktop import Sandbox

from e2b_driver import MODEL, hold_open, live_view, run

FOLDER = "/home/user/orders"
TASK = "The file manager shows a folder. Open priority-order.txt and return only its order number. Do not open other files."

desktop = Sandbox.create(
    resolution=(1280, 800),  # screenshots are sent at this size, which fits the model's image limits
    timeout=300,
    network={"deny_out": ["0.0.0.0/0"]},  # no internet: this task needs none
)
try:
    live_view(desktop)
    print(f"Task ({MODEL}): {TASK}\n")

    order_number = secrets.token_hex(6).upper()
    desktop.files.write(f"{FOLDER}/priority-order.txt", f"Order number: {order_number}\nPriority: high\n")
    desktop.files.write(f"{FOLDER}/standard-order.txt", "Order number: STANDARD-1001\nPriority: standard\n")
    desktop.open(FOLDER)
    desktop.wait(3000)

    answer = run(desktop, TASK, max_steps=15, time_limit=120)
    print(f"\nAnswer: {answer}")
    print("Correct." if answer.strip() == order_number else f"Wrong: the order number is {order_number}.")

    Path("output").mkdir(exist_ok=True)
    Path("output/1-run.png").write_bytes(desktop.screenshot())
    print("Final screen saved to output/1-run.png")
    hold_open()
finally:
    desktop.kill()
