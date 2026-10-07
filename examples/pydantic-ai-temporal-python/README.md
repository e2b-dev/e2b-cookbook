# Recover a Pydantic AI worker without replacing its E2B sandbox

Fix the same [Python JSONL log CLI](../pydantic-ai-python) across a real worker-process crash. The Temporal server stays alive while the demo kills the first worker, starts a new worker, and continues the original workflow in its existing E2B sandbox.

`E2BSandbox` provides the workspace; `TemporalDurability` records agent operations as Temporal activities. `PydanticAIPlugin` registers those activities from the workflow's `__pydantic_ai_agents__`. There is no custom durable-agent wrapper or sandbox registry.

## Setup and run

Use Python 3.11 or newer and [uv](https://docs.astral.sh/uv/getting-started/installation/). From this directory:

```bash
uv sync --locked
cp .env.example .env
```

Set `E2B_API_KEY` and `OPENAI_API_KEY` in `.env`. `MODEL` defaults to `gpt-4.1-mini`. Both worker processes read the same configuration. Keys stay on the host and are not workflow input or sandbox files.

```bash
uv run python main.py
```

The Temporal Python SDK starts a local development server and downloads its server binary on the first run. No Docker, Temporal Cloud account, or global CLI installation is required. The demo owns this server and its temporary SQLite database and removes them on exit. It uses an ephemeral local server address and a unique task queue/workflow ID for each run.

Model calls are billable. Each of the two agent runs has an eight-request and $0.10 estimated-cost limit, with 1,536 output tokens per model request. Estimated-cost limits depend on provider usage/pricing and can be exceeded by the final request; they are not account spending caps. SDK model retries are disabled; Temporal activity retries are limited to two attempts. The application has a 300-second deadline and bounded command/activity timeouts.

## Crash and recovery sequence

1. The controller creates and seeds **one** sandbox with the native `E2BSandboxBackend`. It retains the ref for cleanup and passes the credential-free `WorkspaceRef` as workflow input. Temporal records that input before the worker runs the agent.
2. The first worker diagnoses the failures and saves `diagnosis.md`. The workflow records the sandbox ID and file checksums, then waits for a `continue_fix` signal.
3. The controller verifies that checkpoint and kills the worker with `Process.kill()` (`SIGKILL` on macOS/Linux). This does not execute Python cleanup or gracefully shut down the worker. The server and sandbox are separate processes/resources and keep their state.
4. A new worker registers the same agent/workflow on the same task queue. Temporal replays the recorded history. The checkpoint query returns the same ID/checksums before the controller signals continuation.
5. The second agent run fixes the CLI with `workspace=ref` and the original message history. The controller restores the trusted tests and verifies the fix independently.
6. The controller checks running **and paused** sandboxes, stops the worker/server, and destroys its sandbox in `finally`.

```text
Created sandbox: <id>
Worker started: pid=<first pid>
Durable checkpoint: <id>; diagnosis and files saved
Worker crashed: pid=<first pid>, exit=-9
Worker started: pid=<different pid>
Checkpoint recovered by pid=<different pid>; sandbox=<same id>
...
Ran 4 tests ...
OK
CLI: {"requests": 4, "server_errors": 2, "p95_ms": 100}
Exactly one sandbox; original workflow completed after worker restart
Cleanup verified: <same id>
```

IDs, PIDs, timing, and model-generated explanations vary. The script asserts sandbox identity and checksums, prints model-request/token/cost totals, and fails if the tests or resource checks fail.

Run the demo without concurrent sandbox creation under the same E2B key so that the account-list difference measures this run. Only the controller-owned sandbox is deleted; unrelated resources are preserved.

## What this proves, and what it does not

The demonstrated crash is **after a persisted workspace ref and diagnosis checkpoint**, between diagnosis and repair. Recovery resumes the existing workflow rather than submitting a second one, and the resource check requires exactly one new running/paused sandbox. It does not demonstrate server/controller crash recovery or a crash during an uncheckpointed sandbox-creation request.

Temporal activities may run again if a worker disappears before completion is recorded. Recovery does not make arbitrary shell commands exactly-once or roll back file writes. Use repeatable operations such as replacing a named result, rather than appending the same output on every attempt. A lost response after remote sandbox creation is also an ambiguous outcome; a general no-duplicate-creation guarantee is not claimed here.

Killing a worker stops its local process; it does not necessarily stop already-started remote commands. This demo crashes at an idle checkpoint, with no command in flight. The controller owns final deletion. An abrupt controller crash may leave a sandbox paused after its 600-second lifetime; explicit cleanup is still necessary.

The agent, workflow class, and capabilities remain unchanged across worker processes. Changing their registration while workflows are running can change replay history; use workflow draining or Temporal worker versioning for real deployments.

See the [native E2B integration](https://pydantic.dev/docs/ai/harness/e2b-sandbox/), [Pydantic AI Temporal documentation](https://pydantic.dev/docs/ai/capabilities/durable_execution/temporal/), and [E2B persistence](https://e2b.dev/docs/sandbox/persistence).
