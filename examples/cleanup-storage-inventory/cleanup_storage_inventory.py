#!/usr/bin/env python3
"""Delete the paused sandboxes and snapshots listed in an E2B storage inventory CSV.

1. Read and validate the whole inventory, then print rows and GiB per type.
   Without --apply, stop here.
2. Delete paused sandboxes first, then snapshots, 1,000 rows at a time, so only one
   chunk is in memory. Up to --concurrency rows run at once, capped at --rate API
   requests per second; rate-limited rows go back in the queue until they succeed.
   With --interactive, ask for the filters and confirm each row instead.
3. Append each row's outcome to <inventory>.results.csv. A re-run skips the rows
   that ended deleted and re-checks the rest.
"""

import argparse
import asyncio
import csv
import os
import sys
import time
from collections import Counter
from collections.abc import Callable, Iterable, Iterator
from datetime import UTC, datetime, timedelta
from itertools import chain, groupby, islice
from pathlib import Path
from typing import NamedTuple

from aiolimiter import AsyncLimiter
from dotenv import load_dotenv
from e2b import (
    AsyncSandbox,
    AuthenticationException,
    NotFoundException,
    RateLimitException,
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
ANSWERS = """For each row:
  y  delete it
  n  skip it; a re-run asks again
  a  delete it and all remaining rows without asking
  q  stop here; nothing more is deleted"""


class Row(NamedTuple):
    kind: str
    id: str
    size_gib: float
    last_used_at: datetime


class Stop(BaseException):
    """Ends the run with a message. A BaseException, so that the per-row
    `except Exception` in delete_row doesn't record it as a failed row."""


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


def rows_to_delete(
    path: Path,
    types: list[str],
    cutoff: datetime | None,
    finished: set[tuple[str, str]],
    limit: int | None,
) -> Iterator[Row]:
    """Yield the selected rows, paused sandboxes first, at most limit of them."""

    def of_kind(kind: str) -> Iterator[Row]:
        for row in read_inventory(path):
            if (
                row.kind == kind
                and (cutoff is None or row.last_used_at < cutoff)
                and (row.kind, row.id) not in finished
            ):
                yield row

    return islice(chain.from_iterable(of_kind(kind) for kind in types), limit)


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


def ask_each_row() -> Callable[[Row], bool]:
    """Return a confirm() that asks y/n/a/q before each deletion."""
    print(ANSWERS)
    delete_all = False

    def confirm(row: Row) -> bool:
        nonlocal delete_all
        while not delete_all:
            # input() blocks the event loop; interactive runs one row at a time anyway.
            answer = input(
                f"Delete {row.kind} {row.id} ({row.size_gib:,.2f} GiB, "
                f"last used {row.last_used_at:%Y-%m-%d})? [y/n/a/q] "
            ).strip()
            if answer == "y":
                return True
            if answer == "n":
                return False
            if answer == "a":
                delete_all = True
            if answer == "q":
                raise Stop("Stopped: nothing more deleted.")
        return True

    return confirm


async def delete_row(
    row: Row, limiter: AsyncLimiter, confirm: Callable[[Row], bool]
) -> tuple[str, str]:
    """Delete one resource and return its (outcome, detail). Stops on 401 or 403."""

    async def call(method, *args):
        async with limiter:
            return await method(*args)

    try:
        if row.kind == "snapshot":
            if not confirm(row):
                return "skipped_by_user", ""
            deleted = await call(AsyncSandbox.delete_snapshot, row.id)
        else:
            info = await call(AsyncSandbox.get_info, row.id)
            if info.state != SandboxState.PAUSED:
                return "skipped_running", ""
            # last_used_at is the last pause; a later start means the sandbox was
            # resumed after the export, so the row no longer describes it.
            if info.started_at > row.last_used_at:
                return "skipped_changed", f"started_at {info.started_at.isoformat()}"
            if not confirm(row):
                return "skipped_by_user", ""
            deleted = await call(AsyncSandbox.kill, row.id)
        return ("deleted", "") if deleted else ("not_found", "")

    except AuthenticationException as error:
        raise Stop(f"error: {error}") from error
    except NotFoundException:
        return "not_found", ""
    # The SDK has already waited out Retry-After; the caller queues the row again.
    except RateLimitException:
        return "rate_limited", ""
    except Exception as error:
        status = getattr(error, "status_code", None)
        if status == 403:
            raise Stop(
                f"error: {error} (on {row.id}): the API key belongs to another team, "
                "or E2B_DOMAIN points at the wrong region"
            ) from error
        if status == 400 and row.kind == "snapshot":
            return "skipped_in_use", str(error)
        # Server errors and timeouts fail the row; a re-run retries it.
        return "failed", f"{type(error).__name__}: {error}"


async def delete_rows(
    rows: Iterator[Row], args: argparse.Namespace, total: int, results_path: Path
) -> tuple[Counter, int]:
    """Delete rows chunk by chunk and append each outcome as it completes.

    Returns the outcome counts and how many requests were rate-limited.
    """
    limiter = AsyncLimiter(args.rate, 1)
    semaphore = asyncio.Semaphore(1 if args.interactive else args.concurrency)
    confirm = ask_each_row() if args.interactive else lambda row: True
    outcomes = Counter()
    requeued = 0
    stopping = False
    started = time.monotonic()

    async def delete(row: Row) -> None:
        nonlocal requeued, stopping
        while True:
            async with semaphore:
                # The next waiting row gets the semaphore before gather() hands
                # the Stop to delete_rows; without this it would still run, or ask.
                if stopping:
                    return
                try:
                    outcome, detail = await delete_row(row, limiter, confirm)
                except Stop:
                    stopping = True
                    raise
            if outcome != "rate_limited":
                break
            requeued += 1
        now = datetime.now(UTC).isoformat(timespec="seconds")
        writer.writerow([row.kind, row.id, outcome, detail, now])
        outcomes[outcome] += 1

    with results_path.open("a", newline="") as file:
        writer = csv.writer(file)
        if file.tell() == 0:
            writer.writerow(RESULT_HEADER)
        for _, rows_of_kind in groupby(rows, key=lambda row: row.kind):
            while chunk := list(islice(rows_of_kind, CHUNK)):
                tasks = [asyncio.create_task(delete(row)) for row in chunk]
                try:
                    await asyncio.gather(*tasks)
                except Stop:
                    # Cancel the rows in flight before the results file closes.
                    for task in tasks:
                        task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
                    raise
                file.flush()
                done = outcomes.total()
                tally = " · ".join(f"{o} {n:,}" for o, n in sorted(outcomes.items()))
                if requeued:
                    tally += f" · requeued {requeued:,}"
                rate = done / (time.monotonic() - started)
                print(
                    f"done {done:,}/{total:,} · {tally} · {rate:,.0f} rows/s",
                    flush=True,
                )
                # A wrong E2B_DOMAIN fails every row after a connect timeout,
                # which would take hours on a large inventory.
                if done == len(chunk) and set(outcomes) == {"failed"}:
                    raise Stop(
                        "error: every row in the first chunk failed; check E2B_DOMAIN "
                        f"and the detail column in {results_path}"
                    )
    return outcomes, requeued


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Delete the resources listed in an E2B storage inventory CSV."
    )
    parser.add_argument("inventory", type=Path)
    parser.add_argument("--type", dest="types", action="append", choices=TYPES)
    parser.add_argument(
        "--older-than-days", type=float, help="only rows last used more than N days ago"
    )
    parser.add_argument("--limit", type=int, help="delete at most N rows in this run")
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument(
        "--rate", type=float, default=100, help="API requests per second, default 100"
    )
    parser.add_argument(
        "--apply", action="store_true", help="permanently delete the selected rows"
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="with --apply: ask for the filters, then confirm each row",
    )
    argv = list(sys.argv[1:] if argv is None else argv)
    args = parser.parse_args(argv)

    if args.interactive:
        if not args.apply:
            parser.error("--interactive needs --apply")
        # The answers become flags, so they're checked like typed ones.
        if args.types is None:
            answer = input("Types to delete (paused_sandbox snapshot) [both]: ")
            for kind in answer.split():
                argv += ["--type", kind]
        if args.older_than_days is None:
            answer = input("Only rows last used more than N days ago [all]: ")
            if answer:
                argv += ["--older-than-days", answer]
        if args.limit is None:
            argv += ["--limit", input("Delete at most N rows [100]: ") or "100"]
        args = parser.parse_args(argv)

    if args.older_than_days is not None and args.older_than_days < 0:
        parser.error("--older-than-days must be at least 0")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be at least 1")
    if args.concurrency < 1:
        parser.error("--concurrency must be at least 1")
    if args.rate <= 0:
        parser.error("--rate must be more than 0")
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

    def rows() -> Iterator[Row]:
        return rows_to_delete(args.inventory, types, cutoff, finished, args.limit)

    # Read the whole file first, so an invalid row stops the script before
    # anything is deleted even when --limit stops the later reads early.
    for _ in read_inventory(args.inventory):
        pass
    total = print_summary(rows())

    if not args.apply:
        print("Dry run: nothing deleted. Re-run with --apply to delete.")
        return 0
    if not total:
        return 0
    if not os.environ.get("E2B_API_KEY"):
        sys.exit(
            "error: set E2B_API_KEY to the API key of the team the inventory belongs to"
        )

    try:
        outcomes, requeued = asyncio.run(delete_rows(rows(), args, total, results_path))
    except Stop as stop:
        sys.exit(str(stop))

    print(f"Results: {results_path}")
    if requeued:
        print(
            f"{requeued:,} requests were rate-limited and queued again. "
            f"A lower --rate (currently {args.rate:g}) avoids that."
        )
    if set(outcomes) - DONE:
        print("Some rows were skipped or failed; re-run to retry them.")
        return 1
    return 0


if __name__ == "__main__":
    load_dotenv()
    sys.exit(main())
