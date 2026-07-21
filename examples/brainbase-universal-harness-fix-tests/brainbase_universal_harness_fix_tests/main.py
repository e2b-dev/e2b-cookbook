"""Fix a failing pytest suite on E2B, through the Brainbase Universal Harness API.

One POST /v2/threads describes a coding agent and seeds a small Python project
whose test suite fails on purpose. The agent runs the tests, tracks down the bug,
fixes it, and re-runs until they all pass. A second turn adds a feature on the
same sandbox. Brainbase provisions the E2B sandbox and runs the agent, so you
never touch an E2B key.

Run it with `python brainbase_universal_harness_fix_tests/main.py` after the
setup in the README.
"""
from __future__ import annotations

import sys

from dotenv import load_dotenv

from brainbase_universal_harness_fix_tests.brainbase import Brainbase

MACHINE_KIND = "e2b"
HARNESS = "claude_code"
MODEL = "claude-sonnet-5"
RULE = "-" * 60

# Bash that prepares the sandbox before the agent starts (it runs in /workspace).
# `set -e` aborts on the first line that fails. We drop in a tiny Python module
# and a test file that is red today, then install pytest at the very end so a
# failed install can't hide behind a half-seeded project. The planted defect:
# roman_to_int only ever adds symbol values, so subtractive pairs such as IV and
# IX read too high and three of the five tests break.
SEED = """set -e
cat > /workspace/roman.py <<'PY'
def roman_to_int(s):
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    for ch in s:
        total += values[ch]
    return total
PY
cat > /workspace/test_roman.py <<'PY'
from roman import roman_to_int


def test_plain_additive():
    assert roman_to_int("III") == 3


def test_subtractive_four():
    assert roman_to_int("IV") == 4


def test_subtractive_nine():
    assert roman_to_int("IX") == 9


def test_mixed_symbols():
    assert roman_to_int("LVIII") == 58


def test_full_year():
    assert roman_to_int("MCMXCIV") == 1994
PY
python3 -m pip install -q pytest"""

INSTRUCTIONS = (
    "You are an autonomous engineer working in a throwaway Linux sandbox. A small "
    "Python project is already here and its tests are red. Turn them green by "
    "changing implementation code only; leave every test file exactly as it is. "
    "Check yourself with pytest and keep iterating until nothing fails. Reply in a "
    "sentence or two."
)

FIRST = (
    "The Python project under /workspace has failing tests. Start by running pytest "
    "to see what breaks, then track down and correct the defect in roman.py until "
    "the whole suite is green. The tests are off-limits, leave them alone."
)
FOLLOWUP = (
    "Now build the inverse in roman.py: a function int_to_roman(n) that turns an "
    "integer between 1 and 3999 into its Roman-numeral form. Cover it with your own "
    "tests and run the suite once more."
)


def render(event: dict) -> bool:
    """Print a friendly line for one SSE event. Returns True on the idle event."""
    etype = event.get("type")
    data = event.get("data") or {}
    if etype == "tool_call.start":
        print(f"  -> {data.get('name') or data.get('tool') or 'tool'}")
    elif etype == "assistant.message":
        parts = data.get("content") or []
        text = "".join(
            p.get("content", "") for p in parts
            if isinstance(p, dict) and p.get("type") == "text"
        )
        if text.strip():
            print(f"\nAgent: {text.strip()[:400]}")
    elif etype == "idle":
        summary = (data.get("summary") or "")[:300]
        print(f"[turn {data.get('status')}] {summary}")
        return True
    return False


def stream_turn(bb: Brainbase, thread_id: str, backfill: int) -> None:
    """Stream one turn to completion (breaks on the idle event)."""
    for event in bb.stream_events(thread_id, backfill=backfill):
        if render(event):
            break


def main() -> int:
    load_dotenv()
    # Line-buffer stdout so progress shows up live even when piped to a file.
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:
        pass
    bb = Brainbase()

    print(f'Creating a "{HARNESS}" agent on {MACHINE_KIND}...')
    created = bb.create_thread(
        FIRST,
        harness=HARNESS,
        model=MODEL,
        machine_kind=MACHINE_KIND,
        instructions=INSTRUCTIONS,
        entrypoint=SEED,
        title="cookbook: fix failing tests (e2b)",
    )
    tid = created["thread_id"]
    print(f"Thread {tid} (agent {created['agent_id']})")

    print(f"\n{RULE}\nUser: {FIRST}")
    stream_turn(bb, tid, backfill=100)

    # The follow-up starts a NEW turn. Use run_and_wait, which waits for that turn
    # to actually finish instead of reading the previous turn's stale status.
    print(f"\n{RULE}\nUser: {FOLLOWUP}")
    settled = bb.run_and_wait(tid, FOLLOWUP, poll_s=5, timeout_s=600)
    print(f"[turn {settled.get('status')}]")

    thread = bb.get_thread(tid)
    machine_id = thread.get("machine_id")
    sandbox_id = thread.get("sandbox_id")
    print(f"\n{RULE}")
    if sandbox_id or machine_id:
        print(f"Ran on {MACHINE_KIND} sandbox: {sandbox_id or machine_id}")
    print(f"Final status: {thread.get('status')}")

    messages = bb.get_messages(tid)
    print(f"\nTranscript ({len(messages)} messages):")
    for message in messages:
        content = message.get("content") or ""
        if isinstance(content, list):
            content = "".join(
                p.get("content", "") for p in content if isinstance(p, dict)
            )
        line = " ".join(str(content).split())
        if line:
            print(f"  {message.get('role')}: {line[:120]}")

    print("\nThe sandbox stays warm for more turns.")
    if machine_id:
        print(f"Stop it when you are done:  bb.teardown_machine('{machine_id}')")
    bb.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
