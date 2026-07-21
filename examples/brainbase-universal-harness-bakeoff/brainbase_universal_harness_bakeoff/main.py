"""Multi-harness bake-off on E2B: fix a buggy function, graded and ranked.

Every harness gets the same broken binary search and is asked to fix it, each in
its own isolated E2B sandbox, through the Brainbase Universal Harness API. When a
run finishes we download its solution.py and grade it against a hidden test suite
the agent never saw, by importing and running it in a subprocess with a timeout.
Then we rank by score, then by wall-time, and tear the sandboxes down.

The agents only see the spec; the tests live in this file. That keeps the
comparison objective and hard to game: a harness can't stuff solution.py with
text to pass a grep, and its own tests (if it writes any) don't count. The
unfixed baseline scores 0/12, so every point on the board is a real fix.

Grading runs the model's code locally in a subprocess (-I, 15s timeout). It is a
pure function from a benign prompt, but if you would rather not run it on your
machine, push the hidden tests into each sandbox and run them there instead.

Brainbase provisions and manages the E2B sandboxes, so you never need an E2B key.

Run it with `python brainbase_universal_harness_bakeoff/main.py` after the setup
in the README.
"""
from __future__ import annotations

import concurrent.futures as cf
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from dotenv import load_dotenv

from brainbase_universal_harness_bakeoff.brainbase import Brainbase, BrainbaseError

MACHINE_KIND = "e2b"

# harness -> model (None = the harness/deployment default). Not every harness is
# guaranteed on every provider; an unavailable combo shows up as an error row.
MATRIX: dict[str, str | None] = {
    "claude_code": "claude-sonnet-5",
    "codex": None,
    "opencode": "zai-org/GLM-5.2",
    "qwen": "claude-sonnet-5",
}

# The broken function each harness has to fix. It behaves like bisect_right: it
# never returns -1 and lands one past the target, so it fails every case below.
BUGGY = '''def search(arr, target):
    """Return the index of target in the sorted list arr, or -1 if absent."""
    lo, hi = 0, len(arr)
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] <= target:
            lo = mid + 1
        else:
            hi = mid
    return lo
'''

TASK = (
    "A file solution.py contains this buggy binary search:\n\n"
    f"{BUGGY}\n"
    "It is wrong. Rewrite solution.py so that search(arr, target) (keep that "
    "exact name and signature) returns the index of target in the ascending, "
    "possibly-duplicate sorted list arr, or -1 if target is not there. "
    "Requirements:\n"
    "  - return -1 when target is not present (including an empty list, or a "
    "target below or above every element);\n"
    "  - when target appears more than once, return the LEFTMOST index;\n"
    "  - keep it O(log n).\n"
    "Write the fixed function to solution.py in the workspace root. No extra "
    "prints, and do not rename the function."
)

# Hidden tests: (args, expected). The agent never sees these. The buggy version
# above scores 0/12 against them.
CASES: list[tuple[tuple, int]] = [
    (([1, 3, 5, 7], 5), 2),        # found, unique
    (([1, 3, 5], 4), -1),          # not found, in range
    (([2, 4, 6], 1), -1),          # not found, below all
    (([2, 4, 6], 9), -1),          # not found, above all
    (([], 3), -1),                 # empty list
    (([1, 2, 2, 2, 3], 2), 1),     # duplicates -> leftmost
    (([5], 5), 0),                 # single, found
    (([5], 4), -1),                # single, not found
    (([1, 2, 3], 1), 0),           # first element
    (([1, 2, 3], 3), 2),           # last element
    (([2, 2, 2], 2), 0),           # all duplicates
    (([-5, -3, 0, 4], -3), 1),     # negatives
]


def grade(solution_src: str) -> tuple[int, int, str]:
    """Run a solution.py source against the hidden CASES in a subprocess.

    Returns (passed, total, note). note is 'ok', 'timeout' (infinite loop or too
    slow), or 'error' (the file won't import or has no usable search()).
    """
    total = len(CASES)
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "solution.py").write_text(solution_src)
        grader = (
            "import importlib.util as u\n"
            "s = u.spec_from_file_location('solution', 'solution.py')\n"
            "m = u.module_from_spec(s); s.loader.exec_module(m)\n"
            f"CASES = {CASES!r}\n"
            "p = 0\n"
            "for args, exp in CASES:\n"
            "    try:\n"
            "        ok = m.search(*args) == exp\n"
            "    except Exception:\n"
            "        ok = False\n"
            "    p += 1 if ok else 0\n"
            "print(f'SCORE {p}/{len(CASES)}')\n"
        )
        (Path(d) / "_grade.py").write_text(grader)
        try:
            r = subprocess.run(
                [sys.executable, "-I", "_grade.py"], cwd=d,
                capture_output=True, text=True, timeout=15,
            )
        except subprocess.TimeoutExpired:
            return 0, total, "timeout"
    for line in reversed(r.stdout.splitlines()):
        if line.startswith("SCORE"):
            try:
                return int(line.split()[1].split("/")[0]), total, "ok"
            except (IndexError, ValueError):
                break
    return 0, total, "error"


def run_one(harness: str, model: str | None) -> dict:
    """Fix the bug on one harness (E2B sandbox), then grade its solution.py."""
    bb = Brainbase()
    t0 = time.time()
    row = {"harness": harness, "model": model or "(default)", "status": "error",
           "passed": 0, "total": len(CASES), "note": "-", "secs": 0.0,
           "machine_id": None}
    try:
        created = bb.create_thread(
            TASK, harness=harness, model=model, machine_kind=MACHINE_KIND,
            title=f"bakeoff/{MACHINE_KIND}: {harness}",
        )
        tid = created["thread_id"]
        thread = bb.wait(tid, poll_s=6, timeout_s=900)
        row["status"] = thread.get("status", "?")
        row["machine_id"] = thread.get("machine_id")
        try:
            src = bb.download(tid, "solution.py").decode("utf-8", "replace")
        except BrainbaseError:
            row["note"] = "no-file"
            return row
        row["passed"], row["total"], row["note"] = grade(src)
    except BrainbaseError as exc:
        row["note"] = f"error: {str(exc)[:40]}"
    finally:
        row["secs"] = round(time.time() - t0, 1)
        bb.close()
    return row


def score_cell(row: dict) -> str:
    """What to show in the score column: the count, or why there is no count."""
    if row["note"] in ("timeout", "no-file", "ok"):
        return "timeout" if row["note"] == "timeout" else f"{row['passed']}/{row['total']}"
    return "error"


def main() -> int:
    load_dotenv()
    # Line-buffer stdout so progress shows up live even when piped to a file.
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:
        pass
    baseline_passed, baseline_total, _ = grade(BUGGY)  # self-check + show baseline
    matrix = list(MATRIX.items())
    print(f"Unfixed baseline scores {baseline_passed}/{baseline_total}. Launching "
          f"{len(matrix)} harnesses on {MACHINE_KIND} to fix it...\n")

    rows: list[dict] = []
    with cf.ThreadPoolExecutor(max_workers=len(matrix)) as pool:
        futures = {pool.submit(run_one, h, m): h for h, m in matrix}
        for fut in cf.as_completed(futures):
            row = fut.result()
            rows.append(row)
            print(f"  finished {row['harness']:12} {row['status']:8} "
                  f"{score_cell(row):8} {row['secs']}s")

    # Rank by score (high to low), then wall-time (low to high).
    rows.sort(key=lambda r: (-r["passed"], r["secs"]))
    print(f"\n=== BAKE-OFF RESULTS ({MACHINE_KIND}): fix the buggy binary search ===")
    print(f"{'harness':12} {'model':22} {'status':9} {'score':8} {'secs':>6}")
    print("-" * 62)
    for r in rows:
        print(f"{r['harness']:12} {r['model']:22} {r['status']:9} "
              f"{score_cell(r):8} {r['secs']:>6}")

    # Teardown so idle sandboxes stop burning credits.
    bb = Brainbase()
    for r in rows:
        if r.get("machine_id"):
            try:
                bb.teardown_machine(r["machine_id"])
            except BrainbaseError:
                pass
    bb.close()
    print(f"\nTore down all {MACHINE_KIND} bake-off sandboxes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
