#!/usr/bin/env python3

import argparse
import csv
import os
import sys
import time
from collections import Counter
from collections.abc import Callable, Iterable, Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from itertools import islice
from pathlib import Path
from typing import NamedTuple

from e2b import (
    AuthenticationException,
    NotFoundException,
    RateLimitException,
    Sandbox,
    SandboxException,
    SandboxState,
)

HEADER = ["as_of_date", "resource_type", "resource_id", "size_gib", "last_used_at"]
RESULT_HEADER = ["resource_type", "resource_id", "outcome", "detail", "timestamp"]
# Paused sandboxes go first: a snapshot can't be deleted while a paused
# sandbox in the same file is still based on it.
TYPES = ["paused_sandbox", "snapshot"]
# Re-runs skip only deleted rows. A sandbox owned by another team also
# returns 404, so a run with the wrong key must not mark rows as done.
FINISHED = {"deleted"}
DONE = {"deleted", "not_found"}
CHUNK = 1000


class Row(NamedTuple):
    """One resource from the inventory."""

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


def summarize(rows: Iterable[Row]) -> tuple[str, int]:
    """Count rows and total GiB per resource type; return the summary and the row count."""
    counts, gib = Counter(), Counter()
    for row in rows:
        counts[row.kind] += 1
        gib[row.kind] += row.size_gib
    lines = [
        f"  {kind:<15}{counts[kind]:>10,} rows{gib[kind]:>14,.2f} GiB" for kind in TYPES
    ]
    return "\n".join(lines), counts.total()


def delete(client, row: Row) -> tuple[str, str]:
    """Delete one resource and return its (outcome, detail)."""
    if row.kind == "snapshot":
        try:
            return (
                ("deleted", "") if client.delete_snapshot(row.id) else ("not_found", "")
            )
        except SandboxException as error:
            if error.status_code == 400:
                return "skipped_in_use", str(error)
            raise

    try:
        info = client.get_info(row.id)
    except NotFoundException:
        return "not_found", ""
    if info.state != SandboxState.PAUSED:
        return "skipped_running", ""
    # last_used_at is the last pause; a later start means the sandbox was
    # resumed after the export, so the row no longer describes it.
    if info.started_at > row.last_used_at:
        return "skipped_changed", f"started_at {info.started_at.isoformat()}"
    return ("deleted", "") if client.kill(row.id) else ("not_found", "")


def process(client, row: Row) -> tuple[str, str]:
    """Run delete(), turning API errors into a failed outcome. Exits on 401 or 403."""
    try:
        return delete(client, row)
    except Exception as error:
        # pool.map re-raises these in the main thread and cancels the queued rows.
        if isinstance(error, AuthenticationException):
            raise SystemExit(f"error: {error}") from error
        if getattr(error, "status_code", None) == 403:
            raise SystemExit(
                f"error: {error} (on {row.id}): the API key belongs to another team, "
                "or E2B_DOMAIN points at the wrong region"
            ) from error
        # The SDK has already waited out Retry-After; a re-run retries the row.
        if isinstance(error, RateLimitException):
            return "rate_limited", str(error)
        # Server errors and timeouts fail the row; a re-run retries it.
        return "failed", f"{type(error).__name__}: {error}"


def run(
    client,
    path: Path,
    selected: Callable[[Row], bool],
    total: int,
    workers: int,
    results_path: Path,
) -> int:
    """Delete the selected rows in parallel, one chunk at a time, paused sandboxes first.

    Reads the inventory once per resource type so only one chunk is in memory.
    Appends each outcome to the results file.
    """
    counts = Counter()
    started = time.monotonic()
    with (
        results_path.open("a", newline="") as file,
        ThreadPoolExecutor(workers) as pool,
    ):
        writer = csv.writer(file)
        if file.tell() == 0:
            writer.writerow(RESULT_HEADER)
        for kind in TYPES:
            rows = (r for r in read_inventory(path) if r.kind == kind and selected(r))
            while chunk := list(islice(rows, CHUNK)):
                for row, (outcome, detail) in zip(
                    chunk, pool.map(lambda row: process(client, row), chunk)
                ):
                    now = datetime.now(UTC).isoformat(timespec="seconds")
                    writer.writerow([row.kind, row.id, outcome, detail, now])
                    counts[outcome] += 1
                file.flush()
                done = sum(counts.values())
                tally = " · ".join(
                    f"{outcome} {n:,}" for outcome, n in sorted(counts.items())
                )
                rate = done / (time.monotonic() - started)
                print(
                    f"done {done:,}/{total:,} · {tally} · {rate:,.0f} rows/s",
                    flush=True,
                )

    print(f"Results: {results_path}")
    if counts["rate_limited"]:
        print(
            f"{counts['rate_limited']:,} rows were rate-limited. "
            f"Re-run with fewer --workers (currently {workers})."
        )
    if set(counts) - DONE:
        print("Some rows were skipped or failed; re-run to retry them.")
        return 1
    return 0


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    """Parse and check the command-line arguments."""
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
    parser.add_argument(
        "--yes", action="store_true", help="skip the confirmation prompt"
    )
    args = parser.parse_args(argv)
    if args.workers < 1:
        parser.error("--workers must be at least 1")
    return args


def selector(
    args: argparse.Namespace, finished: set[tuple[str, str]]
) -> Callable[[Row], bool]:
    """Return a filter for the rows to delete: --type, --older-than-days, not yet finished."""
    types = args.types or TYPES
    cutoff = None
    if args.older_than_days is not None:
        cutoff = datetime.now(UTC) - timedelta(days=args.older_than_days)

    def selected(row: Row) -> bool:
        return (
            row.kind in types
            and (cutoff is None or row.last_used_at < cutoff)
            and (row.kind, row.id) not in finished
        )

    return selected


def confirm(assume_yes: bool) -> None:
    """Exit unless --yes was given or the user types 'delete'."""
    if assume_yes:
        return
    if not sys.stdin.isatty():
        sys.exit("error: --apply without a terminal needs --yes")
    prompt = "This is permanent and cannot be undone. Type 'delete' to continue: "
    if input(prompt) != "delete":
        sys.exit("Aborted: nothing deleted.")


def main(argv: list[str] | None = None, client=Sandbox) -> int:
    """Print the dry run and, with --apply, delete the selected rows."""
    args = parse_args(argv)
    results_path = args.inventory.with_name(f"{args.inventory.stem}.results.csv")

    finished = read_finished(results_path)
    if finished:
        print(f"Skipping rows already finished in {results_path}.")
    selected = selector(args, finished)

    # This first full pass also validates the whole file before anything is deleted.
    summary, total = summarize(r for r in read_inventory(args.inventory) if selected(r))
    print(f"To delete:\n{summary}")

    if not args.apply:
        print("Dry run: nothing deleted. Re-run with --apply to delete.")
        return 0
    if not total:
        return 0

    if not os.environ.get("E2B_API_KEY"):
        sys.exit(
            "error: set E2B_API_KEY to the API key of the team the inventory belongs to"
        )
    confirm(args.yes)
    return run(client, args.inventory, selected, total, args.workers, results_path)


if __name__ == "__main__":
    sys.exit(main())
