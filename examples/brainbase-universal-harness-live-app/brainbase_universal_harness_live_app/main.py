"""Build and serve a web app on E2B, and get a live preview URL.

One POST /v2/threads spins up an isolated E2B sandbox, has a coding agent build
and serve a small web app, and hands back a live URL you can open in a browser.
A second turn edits the running app on the same sandbox, and the URL keeps
serving the updated version.

Run it with `python brainbase_universal_harness_live_app/main.py` after the setup
in the README.
"""
from __future__ import annotations

import sys

import httpx
from dotenv import load_dotenv

from brainbase_universal_harness_live_app.brainbase import Brainbase

MACHINE_KIND = "e2b"
HARNESS = "claude_code"
MODEL = "claude-sonnet-5"
PORT = 3000
HEADER_TEXT = "Brainbase TODO"  # the second turn adds this header; we verify it lands

APP_PROMPT = (
    "Build a small single-page web app: a clean TODO list with add, toggle, and "
    "delete, styled with plain HTML/CSS/JS in a single index.html (no build step). "
    f"Then serve the current directory on port {PORT} bound to 0.0.0.0 in the "
    "background so it keeps running:\n"
    f"  nohup python3 -m http.server {PORT} --bind 0.0.0.0 >/tmp/srv.log 2>&1 &\n"
    f"Confirm it is listening with: curl -s localhost:{PORT} | head. Leave the "
    "server running."
)
APP_FOLLOWUP = (
    f"Give the app a dark theme and add a header that reads '{HEADER_TEXT}'. Keep "
    "the same server running on the same port."
)


def render(event: dict) -> bool:
    """Print a friendly line for one SSE event. Returns True on the idle event."""
    etype = event.get("type")
    data = event.get("data") or {}
    if etype == "tool_call.start":
        args = data.get("args") or {}
        hint = args.get("command") or args.get("path") or args.get("file_path") or ""
        print(f"  -> {data.get('name', 'tool')} {str(hint)[:80]}")
    elif etype == "assistant.message":
        for part in data.get("content", []):
            if isinstance(part, dict) and part.get("type") == "text" and part.get("content"):
                print(f"\nAgent: {part['content'][:300]}")
    elif etype == "idle":
        print(f"[turn {data.get('status')}] {(data.get('summary') or '')[:300]}")
        return True
    return False


def stream_turn(bb: Brainbase, thread_id: str, backfill: int) -> None:
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

    print(f"1. Creating an {MACHINE_KIND} thread (inline agent and first prompt)...")
    created = bb.create_thread(
        APP_PROMPT,
        harness=HARNESS,
        model=MODEL,
        machine_kind=MACHINE_KIND,
        instructions="You build tiny web apps and keep their dev server running.",
        title="cookbook: one-prompt live app (e2b)",
    )
    tid = created["thread_id"]
    print(f"   thread {tid} (agent {created['agent_id']})\n")

    print("2. Streaming the build...")
    stream_turn(bb, tid, backfill=100)

    thread = bb.get_thread(tid)
    machine_id = thread["machine_id"]

    print("\n3. Resolving the live preview URL...")
    pv = bb.preview(machine_id, PORT)
    probe = httpx.get(pv.url, headers=pv.headers, follow_redirects=True, timeout=30)
    print(f"   probe: GET {pv.url} -> {probe.status_code} ({len(probe.content)} bytes)")
    if not pv.is_branded:
        print(f"   (token-gated URL: send the {pv.token_header} header to open it)")
    print(f"\n   Open it in a browser:\n     {pv.url}\n")

    print("4. Editing the same running app on a second turn...")
    # run_and_wait actually waits for the follow-up turn to finish, so the edit
    # has really happened before we check the page.
    settled = bb.run_and_wait(tid, APP_FOLLOWUP, poll_s=5, timeout_s=600)
    print(f"   [turn {settled.get('status')}]")

    after = httpx.get(pv.url, headers=pv.headers, follow_redirects=True, timeout=30)
    landed = HEADER_TEXT in after.text
    print(f"   same URL still live after the edit -> {after.status_code}")
    print(f"   edit landed (page now shows '{HEADER_TEXT}'): {landed}")
    if not landed:
        print("   NOTE: the new header is not in the served page yet; see the turn output above.")

    print("\nDone. The sandbox stays warm for more turns.")
    print(f"Stop it when you are done:  bb.teardown_machine('{machine_id}')")
    bb.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
