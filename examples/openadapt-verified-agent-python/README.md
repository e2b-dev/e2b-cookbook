# Verified browser agent replay with OpenAdapt + E2B (Python)

This example runs [OpenAdapt](https://github.com/OpenAdaptAI/OpenAdapt) inside an E2B sandbox. OpenAdapt records a browser workflow once, compiles it into a deterministic program, replays it on new inputs with zero model calls, and reads each write back from the app's system of record so silent failed saves are caught instead of reported as done.

## What the demo does

1. Starts a fresh E2B sandbox and ensures `uv` is available.
2. Runs OpenAdapt headlessly inside the sandbox:
   - Without `ANTHROPIC_API_KEY`, it runs `openadapt quickstart` against a bundled synthetic clinic app: records once, compiles, replays with 0 model calls and verifies the record in the database, then injects a silent failed save and catches it.
   - With `ANTHROPIC_API_KEY`, it runs `openadapt wrap --example --json`: runs the built-in agent once, compiles and admits the program, then replays on a new input with 0 model calls and read-back verification.
3. Kills the sandbox on exit or failure.

## Setup

```bash
cd examples/openadapt-verified-agent-python
cp .env.example .env
# Add E2B_API_KEY (and optionally ANTHROPIC_API_KEY) to .env
set -a
source .env
set +a
```

Install dependencies and run the unit tests:

```bash
uv sync
uv run python -m unittest discover -s tests -v
```

## Run

```bash
uv run python main.py
```

## Wrapping your own browser agent

Once you have a task file (`task.yaml`) describing the target workflow and its read-back check, wrap your own agent command on the first run:

```bash
openadapt wrap --task task.yaml --param patient=Jane -- python your_agent.py
```

On the first run, OpenAdapt passes `OPENADAPT_MCP_URL`, `OPENADAPT_MCP_TOKEN`, and `OPENADAPT_TASK` to your command, records the actions, verifies the write, and compiles the program.

On every subsequent run, execute the admitted program directly with zero model calls:

```bash
openadapt wrap run --task task.yaml --param patient=John
```

See the [OpenAdapt documentation](https://docs.openadapt.ai) for task configuration, read-back verification, and policy controls.
