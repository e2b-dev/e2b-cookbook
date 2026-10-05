#!/usr/bin/env python3
"""Delete the paused sandboxes and snapshots listed in an E2B storage inventory CSV.

1. Read and validate the whole inventory, then print rows and GiB per type.
   Without --apply, stop here.
2. Delete paused sandboxes first, then snapshots, in parallel, 1,000 rows at a time,
   so only one chunk is in memory.
3. Append each row's outcome to <inventory>.results.csv. A re-run skips the rows
   that ended deleted and re-checks the rest.
"""

import argparse
import csv
import os
import sys
import time
from collections import Counter
from collections.abc import Iterable, Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from itertools import islice
from pathlib import Path
from typing import NamedTuple

from dotenv import load_dotenv
from e2b import (
    AuthenticationException,
    NotFoundException,
    RateLimitException,
    Sandbox,
    SandboxState,
)

HEADER = ["as_of_date", "resource_type", "resource_id", "size_gib", "last_used_at"]
RESULT_HEADER = ["resource_type", "resource_id", "outcome", "detail", "timestamp"]
# Paused sandboxes go first: a snapshot can't be deleted while a paused
# sandbox in the same file is still based on it.
TYPES = ["paused_sandbox", "snapshot"]
# Re-runs skip only deleted rows.
FINISHED = {"deleted"}
DONE = {"deleted", "not_found"}
CHUNK = 1000


class Row(NamedTuple):
    kind: str
    id: str
    size_gib: float
    last_used_at: datetime


def read_inventory(path: Path) -> Iterator[Row]:
    """Yield the inventory's rows one at a time, exiting on the first invalid row."""
    with path.open(newline="") as file:
        reader = csv.reader(file)
        if next(reader, None) != HEADER:
            sys.exit(f"error: the first line of {path} must be {','.join(HEADER)}")
        for fields in reader:
            try:
                _, kind, resource_id, size_gib, last_used_at = fields
                if kind not in TYPES:
                    raise ValueError(f"unknown resource_type {kind!r}")
                if not resource_id:
                    raise ValueError("empty resource_id")
                row = Row(
                    kind,
                    resource_id,
                    float(size_gib),
                    datetime.fromisoformat(last_used_at),
                )
                if row.last_used_at.tzinfo is None:
                    raise ValueError("last_used_at has no timezone")
            except ValueError as error:
                sys.exit(f"error: line {reader.line_num}: {error}")
            yield row


def read_finished(path: Path) -> set[tuple[str, str]]:
    """Return the rows whose latest outcome in the results file is final."""
    if not path.exists():
        return set()
    with path.open(newline="") as file:
        last = {
            (r["resource_type"], r["resource_id"]): r["outcome"]
            for r in csv.DictReader(file)
        }
    return {key for key, outcome in last.items() if outcome in FINISHED}


def selected_rows(
    path: Path,
    types: list[str],
    cutoff: datetime | None,
    finished: set[tuple[str, str]],
) -> Iterator[Row]:
    """Yield the rows of the given types, last used before cutoff and not yet finished."""
    for row in read_inventory(path):
        if (
            row.kind in types
            and (cutoff is None or row.last_used_at < cutoff)
            and (row.kind, row.id) not in finished
        ):
            yield row


def print_summary(rows: Iterable[Row]) -> int:
    """Print rows and GiB per type; return the row count."""
    counts, gib = Counter(), Counter()
    for row in rows:
        counts[row.kind] += 1
        gib[row.kind] += row.size_gib
    print("To delete:")
    for kind in TYPES:
        print(f"  {kind:<15}{counts[kind]:>10,} rows{gib[kind]:>14,.2f} GiB")
    return counts.total()


def delete_row(row: Row) -> tuple[str, str]:
    """Delete one resource and return its (outcome, detail). Exits on 401 or 403."""
    try:
        if row.kind == "snapshot":
            deleted = Sandbox.delete_snapshot(row.id)
        else:
            info = Sandbox.get_info(row.id)
            if info.state != SandboxState.PAUSED:
                return "skipped_running", ""
            # last_used_at is the last pause; a later start means the sandbox was
            # resumed after the export, so the row no longer describes it.
            if info.started_at > row.last_used_at:
                return "skipped_changed", f"started_at {info.started_at.isoformat()}"
            deleted = Sandbox.kill(row.id)
        return ("deleted", "") if deleted else ("not_found", "")

    # pool.map re-raises the SystemExits in the main thread and cancels the queued rows.
    except AuthenticationException as error:
        raise SystemExit(f"error: {error}") from error
    except NotFoundException:
        return "not_found", ""
    # The SDK has already waited out Retry-After; a re-run retries the row.
    except RateLimitException as error:
        return "rate_limited", str(error)
    except Exception as error:
        status = getattr(error, "status_code", None)
        if status == 403:
            raise SystemExit(
                f"error: {error} (on {row.id}): the API key belongs to another team, "
                "or E2B_DOMAIN points at the wrong region"
            ) from error
        if status == 400 and row.kind == "snapshot":
            return "skipped_in_use", str(error)
        # Server errors and timeouts fail the row; a re-run retries it.
        return "failed", f"{type(error).__name__}: {error}"


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Delete the resources listed in an E2B storage inventory CSV."
    )
    parser.add_argument("inventory", type=Path)
    parser.add_argument("--type", dest="types", action="append", choices=TYPES)
    parser.add_argument(
        "--older-than-days", type=float, help="only rows last used more than N days ago"
    )
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument(
        "--apply", action="store_true", help="permanently delete the selected rows"
    )
    args = parser.parse_args(argv)
    if args.workers < 1:
        parser.error("--workers must be at least 1")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    types = [t for t in TYPES if t in (args.types or TYPES)]
    results_path = args.inventory.with_name(f"{args.inventory.stem}.results.csv")

    finished = read_finished(results_path)
    if finished:
        print(f"Skipping rows already finished in {results_path}.")

    cutoff = None
    if args.older_than_days is not None:
        cutoff = datetime.now(UTC) - timedelta(days=args.older_than_days)

    # This first full pass also validates the whole file before anything is deleted.
    total = print_summary(selected_rows(args.inventory, types, cutoff, finished))

    if not args.apply:
        print("Dry run: nothing deleted. Re-run with --apply to delete.")
        return 0
    if not total:
        return 0
    if not os.environ.get("E2B_API_KEY"):
        sys.exit(
            "error: set E2B_API_KEY to the API key of the team the inventory belongs to"
        )

    outcomes = Counter()
    started = time.monotonic()
    with (
        results_path.open("a", newline="") as file,
        ThreadPoolExecutor(args.workers) as pool,
    ):
        writer = csv.writer(file)
        if file.tell() == 0:
            writer.writerow(RESULT_HEADER)
        for kind in types:
            rows = selected_rows(args.inventory, [kind], cutoff, finished)
            while chunk := list(islice(rows, CHUNK)):
                for row, (outcome, detail) in zip(chunk, pool.map(delete_row, chunk)):
                    now = datetime.now(UTC).isoformat(timespec="seconds")
                    writer.writerow([row.kind, row.id, outcome, detail, now])
                    outcomes[outcome] += 1
                file.flush()
                done = outcomes.total()
                tally = " · ".join(f"{o} {n:,}" for o, n in sorted(outcomes.items()))
                rate = done / (time.monotonic() - started)
                print(
                    f"done {done:,}/{total:,} · {tally} · {rate:,.0f} rows/s",
                    flush=True,
                )
                # A wrong E2B_DOMAIN fails every row after a connect timeout,
                # which would take hours on a large inventory.
                if done == len(chunk) and set(outcomes) == {"failed"}:
                    sys.exit(
                        "error: every row in the first chunk failed; check E2B_DOMAIN "
                        f"and the detail column in {results_path}"
                    )

    print(f"Results: {results_path}")
    if outcomes["rate_limited"]:
        print(
            f"{outcomes['rate_limited']:,} rows were rate-limited. "
            f"Re-run with fewer --workers (currently {args.workers})."
        )
    if set(outcomes) - DONE:
        print("Some rows were skipped or failed; re-run to retry them.")
        return 1
    return 0


if __name__ == "__main__":
    load_dotenv()
    sys.exit(main())
