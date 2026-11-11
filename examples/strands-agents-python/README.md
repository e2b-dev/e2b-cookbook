# Strands Agents data analyst in an E2B sandbox

<!-- TODO before marking the PR ready: after strands-e2b is on PyPI, run `uv lock`, commit uv.lock, rerun `uv sync --locked && uv run main.py`, and drop this comment. -->

A [Strands Agents](https://strandsagents.com/) agent analyzes a sales CSV with pandas and matplotlib. Its Python, shell, and file tools run in an E2B sandbox through [`strands-e2b`](https://github.com/e2b-dev/strands-e2b), so the code the model writes never runs on your machine.

The script:

1. creates a sandbox from the `code-interpreter-v1` template (pandas and matplotlib preinstalled) with internet access off;
2. writes `sales.csv` into it;
3. asks the agent to find each region's best month, plot the revenue to `chart.png`, and write `summary.json`;
4. checks `summary.json` against its own computation, downloads `chart.png`, and kills the sandbox.

## Setup and run

Use Python 3.11 or newer and [uv](https://docs.astral.sh/uv/getting-started/installation/). From this directory:

```bash
uv sync --locked
cp .env.example .env
```

Set `E2B_API_KEY` and `ANTHROPIC_API_KEY` in `.env`. `MODEL` defaults to `claude-haiku-5-5`. To use another Strands model provider, change the model construction in `main.py` and install that provider's extra. The keys stay on your machine: the model runs on the host and the sandbox environment does not inherit them.

```bash
uv run main.py
```

The run makes a few billable model calls and is bounded by a 300-second application deadline.

## What to expect

Your sandbox ID, tool calls, and wording will differ:

```text
Sandbox: <id>

Tool #1: sandbox_python_repl
...
The best month is 2026-05 for north, 2026-04 for south, and 2026-06 for west; ...
Tools used: ['sandbox_python_repl']
Verified summary.json {'north': '2026-05', 'south': '2026-04', 'west': '2026-06'}; saved chart.png (59726 bytes)
```

`chart.png` appears in this directory. The script fails if `summary.json` is wrong or `chart.png` is not a PNG, instead of trusting the agent's reply.

## How it works

`E2BSandbox(sandbox, working_dir=...)` plugs into Strands' native `Agent(sandbox=...)` API and registers `sandbox_shell`, `sandbox_python_repl`, `sandbox_read`, `sandbox_write`, and `sandbox_edit`. The application also uses it directly to seed `sales.csv` and read the results back.

- **You own the sandbox.** The script creates it and kills it in `finally`. Neither Strands nor `strands-e2b` creates, extends, or kills it.
- **Files persist, processes don't.** Each `sandbox_python_repl` call starts a fresh `python3`, so variables don't carry over between calls. Agents sometimes notice this mid-run and rerun their whole script; save intermediate results to files.
- **Timeouts kill the process group.** When a tool call times out or is cancelled, its process group in the sandbox is killed, including the `python3` it started. A process that starts its own session, such as a daemon, is not reached.

See the [`strands-e2b` README](https://github.com/e2b-dev/strands-e2b#readme) for all options and behavior.
