#!/usr/bin/env python3

import argparse
from datetime import datetime, timedelta, timezone

from e2b import Sandbox, SandboxQuery, SandboxState


def metadata_arg(value: str) -> dict[str, str]:
    try:
        return dict(item.split("=", 1) for item in value.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError("use key=value,key2=value2") from error


parser = argparse.ArgumentParser()
parser.add_argument("--days", type=float, default=90)
parser.add_argument("--metadata", type=metadata_arg)
parser.add_argument("--apply", action="store_true", help="permanently delete matches")
args = parser.parse_args()

if args.days < 0:
    parser.error("--days must be non-negative")

cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
paginator = Sandbox.list(
    query=SandboxQuery(state=[SandboxState.PAUSED], metadata=args.metadata),
    limit=100,
)

matched = deleted = 0
while paginator.has_next:
    for sandbox in paginator.next_items():
        if sandbox.started_at >= cutoff:
            continue

        matched += 1
        print(f"{sandbox.sandbox_id}\t{sandbox.started_at.isoformat()}")
        if not args.apply:
            continue

        # Re-check in case it resumed after being listed.
        current = Sandbox.get_info(sandbox.sandbox_id)
        if current.state == SandboxState.PAUSED and current.started_at < cutoff:
            if Sandbox.kill(sandbox.sandbox_id):
                deleted += 1

if args.apply:
    print(f"Deleted {deleted} of {matched} matching sandbox(es).")
else:
    print(f"Dry run: {matched} match(es). Re-run with --apply to delete.")
