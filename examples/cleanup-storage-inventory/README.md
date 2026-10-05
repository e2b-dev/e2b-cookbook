# Delete resources listed in a storage inventory

Reads the storage inventory CSV you download from the E2B dashboard and deletes the paused
sandboxes and snapshots it lists. Narrow the file first, by removing rows or with the flags
below. By default it only prints what it would delete; `--apply` deletes permanently.

```bash
uv run cleanup_storage_inventory.py inventory.csv                       # dry run
uv run cleanup_storage_inventory.py inventory.csv --older-than-days 90  # dry run, filtered
uv run cleanup_storage_inventory.py inventory.csv --older-than-days 90 --apply
```

The script reads `E2B_API_KEY` from the environment; use the key of the team the inventory
belongs to. For a team outside the default region, also set `E2B_DOMAIN`. You can also put
them in a `.env` file next to the script; copy `.env.template` to start.

- `--type paused_sandbox|snapshot`: only this type (repeatable).
- `--older-than-days N`: only rows whose `last_used_at` is more than N days ago.
- `--apply`: delete permanently, without asking again. Run the dry run first.
- `--workers N`: concurrent requests, default 16.

Keep the header and the values as exported. The whole file is checked before anything is
deleted; the first invalid row stops the script with its line number.

## What happens to each row

Paused sandboxes are deleted first, so that snapshots they were based on can be deleted
in the same run. Each row ends with one outcome:

- `deleted`
- `not_found`: already gone, e.g. deleted after the inventory was taken.
- `skipped_running`: the sandbox is running.
- `skipped_changed`: the sandbox was resumed after the inventory was taken.
- `skipped_in_use`: a running or paused sandbox is still based on the snapshot.
- `rate_limited`: the API kept rate-limiting the request after the SDK's retries.
- `failed`: the API returned another error. The detail column has it.

A `401` or `403` means the key belongs to another team or `E2B_DOMAIN` points at the wrong
region. The script stops. It also stops if every row of the first 1,000 fails, which usually means `E2B_DOMAIN` is wrong.

Outcomes are written to `<inventory>.results.csv` next to the input. A re-run skips rows that ended
`deleted` and re-checks the rest, including `not_found`, so it is safe to interrupt (Ctrl-C) and run
again.
Rows that were being deleted at the moment of the interrupt, up to `--workers` of them, are not
recorded and report `not_found` on the re-run. The SDK waits out short rate limits on its own, which shows as a lower `rows/s` in the
progress line. If rows still end `rate_limited`, the script says so at the end; re-run with
fewer `--workers`.

The script exits `0` when every row is deleted or gone, and `1` otherwise.

## Before you run it

- **Deletion is permanent.** There is no undo.
- **A sandbox can resume between the check and the delete.** The script deletes a sandbox
  only if it is paused right before the delete. If it resumes in that moment, e.g. through
  auto-resume, the running sandbox is killed. Don't include sandboxes you still use.
- **The inventory is up to a day old.** Download a fresh one before a large cleanup.
- **Large inventories.** The file is read in chunks, so its size doesn't matter, but a re-run
  keeps every finished ID in memory (about 1.3 GB per 10 million) and each row costs one or two
  API calls. Split files above about 10 million rows, keeping the header in each part. For
  inventories with tens of millions of rows, contact support first.
- **Billing.** Deleted resources stop counting toward your storage usage from the next daily
  inventory.
- **Some rows may report `not_found` without being deleted.** A few paused sandboxes can
  appear under an ID the API doesn't accept, and their storage stays. If such rows reappear
  in the next inventory, contact support.

## Tests

```bash
uv run python -m unittest discover -s tests -v
```
