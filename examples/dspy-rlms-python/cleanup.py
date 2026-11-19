"""Reconcile only the sandbox IDs tagged with one logged interpreter session."""

import argparse

from dotenv import load_dotenv
from e2b import Sandbox, SandboxQuery


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session_id", help="dspy_session tag from this invocation's logs/error")
    parser.add_argument("--kill", action="store_true", help="Delete sandboxes with that exact metadata tag")
    args = parser.parse_args()
    if len(args.session_id) != 32 or any(char not in "0123456789abcdef" for char in args.session_id):
        parser.error("session_id must be the logged 32-character lowercase hex tag")
    load_dotenv()
    paginator = Sandbox.list(
        query=SandboxQuery(metadata={"dspy_session": args.session_id}), request_timeout=20
    )
    found = []
    while paginator.has_next:
        found.extend(paginator.next_items())
    for sandbox in found:
        print(f"{sandbox.sandbox_id}: {sandbox.state}")
        if args.kill:
            Sandbox.kill(sandbox.sandbox_id, request_timeout=20)
            print(f"{sandbox.sandbox_id}: deletion acknowledged (or already absent)")
    if not found:
        print("No running or paused sandboxes match this session.")


if __name__ == "__main__":
    main()
