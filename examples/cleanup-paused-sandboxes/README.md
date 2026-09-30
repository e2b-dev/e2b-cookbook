# Delete old paused E2B sandboxes

Both scripts list paused sandboxes and select those whose latest start or resume was more than
90 days ago. They only print matches by default; `--apply` permanently deletes them.

The API returns newest first and has no oldest-first option. The Python version processes each
page as it arrives. The shell version lets the E2B CLI handle pagination and uses `jq` to filter.

## Python SDK

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python cleanup_paused_sandboxes.py          # dry run
.venv/bin/python cleanup_paused_sandboxes.py --apply  # delete
.venv/bin/python cleanup_paused_sandboxes.py --days 30 --metadata env=dev
```

The Python SDK reads `E2B_API_KEY` from the environment.

## Shell and E2B CLI

Requires an authenticated `e2b` CLI and `jq`:

```bash
./cleanup_paused_sandboxes_cli.sh          # dry run
./cleanup_paused_sandboxes_cli.sh --apply  # delete
./cleanup_paused_sandboxes_cli.sh --days 30 --metadata env=dev
```

`--days` defaults to `90`. `--metadata` accepts comma-separated filters such as
`env=dev,customer=acme`; all supplied metadata fields must match.
