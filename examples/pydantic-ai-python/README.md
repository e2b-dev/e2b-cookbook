# Pause and resume a Pydantic AI coding agent with E2B

Diagnose and fix a Python CLI that summarizes JSONL API request logs. Its tests catch incorrect server-error counts and p95 latency. The first agent run saves a diagnosis without changing the code. The application pauses E2B, then a second run fixes the CLI in the same sandbox with the same files and conversation history.

This uses Pydantic AI's native `E2BSandbox` workspace provider, composed with `Shell` and `FileSystem`. No custom E2B adapter or template is needed. The project and its tests use Python's standard library.

## Setup and run

Use Python 3.11 or newer and [uv](https://docs.astral.sh/uv/getting-started/installation/). From this example directory:

```bash
uv sync --locked
cp .env.example .env
```

Set `E2B_API_KEY` and `OPENAI_API_KEY` in `.env`. `MODEL` defaults to `gpt-4.1-mini`, a small OpenAI model with function-tool support. Changing the provider requires changing the model construction and installing its provider extra. The keys stay in the host process; they are never uploaded to the sandbox or sent in prompts.

```bash
uv run python main.py
```

The script makes billable model calls. Each agent run is bounded to eight model requests, 1,536 output tokens per request, and a $0.10 estimated-cost limit. Token and cost limits depend on provider usage and pricing data and can be exceeded by the final request; they are not an account spending cap. A 180-second application deadline and 20-second command timeouts also bound the demo.

## What to expect

The sandbox IDs below are illustrative; your run prints its actual ID and model usage.

```text
Created sandbox: <id>
Diagnosis saved. Model usage: ...
Paused sandbox: <id>
Resumed sandbox: <same id>; checksums unchanged before repair
...
Ran 4 tests ...
OK
CLI: {"requests": 4, "server_errors": 2, "p95_ms": 100}
Cleanup verified: <same id>
```

The application checks that:

- the original test suite fails before the agent works;
- the diagnosis is non-empty and the first run leaves the source unchanged;
- source, input logs, diagnosis, and captured failing-test output have identical SHA-256 hashes immediately after resume;
- the second result has the original `WorkspaceRef`;
- the original regression tests pass after repair, independently of the agent's claims;
- only one new running or paused sandbox exists, and cleanup removes it.

Run this resource-count check without other processes creating sandboxes under the same E2B key. The script only destroys its own sandbox; it never deletes unrelated resources.

## How continuation works

`E2BSandboxBackend` creates a sandbox lazily when the application seeds `fixture_repo/`. The application retains `backend.ref` from that point and passes the backend to the first agent run.

After `await sandbox.pause()`, the script constructs a fresh backend with `E2BSandbox(...).backend(ref)`. Its first file read attaches and resumes the paused sandbox. It then calls `agent.run(..., workspace=ref, message_history=first.all_messages())`. The ref selects the existing workspace; message history carries the conversation. Either the ref or a history containing that ref can select the sandbox, but the ref alone does not preserve conversation context.

`test_log_stats.py` is restored from the trusted host fixture before independent verification, because shell commands can bypass file-tool restrictions. The checks also reject changed input logs. Tests provide bounded evidence for this small CLI; review an agent's patch before using it in a real repository.

## Lifetime and cleanup

The application owns the sandbox and calls `E2BSandbox().destroy(ref)` in `finally`, including after setup or model errors. Cleanup failure propagates; a printed sandbox ID lets you retry deletion. Destroying a paused sandbox does not resume it first.

Pydantic AI does not delete a sandbox when an agent run ends. This example uses a 600-second server lifetime with pause-on-timeout, so a process crash can leave a paused sandbox that still needs explicit deletion. A dead sandbox raises `WorkspaceUnavailableError`; reconnect does not silently create an empty replacement. Pausing retains sandbox state, but kills, file deletion, and sandbox pause retention limits are separate concerns.

Internet access is disabled on newly created sandboxes: this local fixture needs no downloads. Neither model has tools to read or write host paths. Cancelling a local coroutine is not proof that all remote work stopped; explicit sandbox deletion ends the resources this application owns.

See the [native Pydantic AI E2B guide](https://pydantic.dev/docs/ai/harness/e2b-sandbox/), [E2B persistence documentation](https://e2b.dev/docs/sandbox/persistence), and the [Temporal crash-recovery example](../pydantic-ai-temporal-python).
