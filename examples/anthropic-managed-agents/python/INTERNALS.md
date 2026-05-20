# Internals

This example is intentionally small: the E2B-specific code starts a sandbox and runs Anthropic's SDK worker inside it. Anthropic's SDK owns the managed-agents queue loop.

## Runtime Flow

```text
create_environment.py  -> creates Anthropic self-hosted environment
create_agent.py        -> creates a Claude Managed Agent with sandbox tools
build_template.py      -> builds the E2B worker template
start_worker.py        -> starts one E2B sandbox and launches worker.py inside it
worker.py              -> runs EnvironmentWorker.run() inside the sandbox
send_message.py        -> creates a session and streams events
stop_worker.py         -> kills the worker sandbox
```

When `send_message.py` creates a session with `environment_id`, Claude routes tool calls for that session to the self-hosted environment. The E2B sandbox worker is already connected to that environment and executes the tools under `/mnt/session`.

## File Map

| File | Responsibility |
| --- | --- |
| `config.py` | Loads `.env` and exposes typed settings used by the scripts. |
| `create_environment.py` | Creates the Anthropic self-hosted environment and prints the Console URL for the environment key. |
| `create_agent.py` | Creates a Managed Agent with the Anthropic sandbox toolset enabled. |
| `template.py` | Defines the E2B template image and filesystem layout. |
| `build_template.py` | Builds `template.py` into an E2B template name. |
| `start_worker.py` | Creates or reconnects an E2B sandbox, uploads `worker.py`, and starts it with the environment key. |
| `worker.py` | Runs Anthropic's async `EnvironmentWorker` inside the E2B sandbox. |
| `send_message.py` | Creates a session and sends one user message for smoke testing. |
| `stop_worker.py` | Kills the E2B worker sandbox. |

## Functions

### `config.py`

`require_env(name)`

Returns a required environment variable or raises a clear `RuntimeError`. The scripts use this for values that must exist before making API calls.

The module loads environment variables from the repository root `.env` first, then from the example-local `.env`. The local file wins when both exist.

### `create_environment.py`

`main()`

Creates an Anthropic environment with `config={"type": "self_hosted"}`. It prints:

- `ANTHROPIC_ENVIRONMENT_ID`
- the Claude Console URL for that environment
- the next step for generating `ANTHROPIC_ENVIRONMENT_KEY`

The SDK creates the environment, but the environment key is generated from the Console.

### `create_agent.py`

`main()`

Creates a Managed Agent using the requested model, defaulting to `claude-sonnet-4-6`.

It enables Anthropic's `agent_toolset_20260401` with:

- `bash`
- `read`
- `write`
- `edit`
- `glob`
- `grep`
- `web_fetch`
- `web_search`

The example uses `always_allow` permissions so the smoke flow can run without an approval UI.

### `template.py`

`template`

Defines the E2B template:

- starts from Python 3.12 slim
- installs shell utilities used by the sandbox tools
- installs `anthropic>=0.103.0`
- creates writable `/mnt/session`
- creates `/opt/anthropic-managed-agents` for the uploaded worker script
- sets `/mnt/session` as the default workdir

### `build_template.py`

`main()`

Builds the E2B template with `Template.build()` using `E2B_TEMPLATE_NAME`. The default template name is `anthropic-managed-agents`.

### `start_worker.py`

`upload_worker(sandbox)`

Writes the local `worker.py` file into the sandbox at `/opt/anthropic-managed-agents/worker.py`.

`start_worker(sandbox)`

Starts `worker.py` in the background inside the sandbox with:

- `ANTHROPIC_ENVIRONMENT_ID`
- `ANTHROPIC_ENVIRONMENT_KEY`
- `WORKER_MAX_IDLE_SECONDS`
- `LOG_LEVEL`

It redirects worker output to `/opt/anthropic-managed-agents/worker.log` and writes the background process id to `/opt/anthropic-managed-agents/worker.pid`.

`main()`

Creates a new E2B sandbox from `E2B_TEMPLATE_NAME`, or reconnects to `--sandbox-id`. Then it uploads and starts the worker. It prints `E2B_WORKER_SANDBOX_ID` for later cleanup.

### `worker.py`

`max_idle_seconds()`

Parses `WORKER_MAX_IDLE_SECONDS`. Set it to `none`, `null`, or an empty string to disable the SDK worker's idle timeout.

`main()`

Creates an `AsyncAnthropic` client with the environment key and runs:

```python
await client.beta.environments.work.worker(
    environment_id=environment_id,
    environment_key=environment_key,
    workdir="/mnt/session",
    unrestricted_paths=True,
    max_idle=max_idle_seconds(),
).run()
```

This is the core handoff to Anthropic's SDK. The SDK worker polls for work, claims it, heartbeats while handling tool calls, sends tool results back to the session, and stops work items when they are done.

### `send_message.py`

`is_end_turn(event)`

Returns `True` when the streamed session event is a final idle event with `stop_reason.type == "end_turn"`. The smoke driver uses this to stop streaming once Claude has finished the turn.

`main()`

Creates a Managed Agents session using `ANTHROPIC_AGENT_ID` and `ANTHROPIC_ENVIRONMENT_ID`, sends a single user message, prints every streamed event, and exits on `end_turn`.

### `stop_worker.py`

`main()`

Kills the E2B worker sandbox. It accepts a positional sandbox id or falls back to `E2B_WORKER_SANDBOX_ID`.

## Why This Shape

The main design choice is to run `EnvironmentWorker.run()` inside E2B instead of reimplementing Anthropic's work queue on the host. That keeps the example close to Anthropic's self-hosted environment model while still showing the E2B-specific pieces:

- build the worker runtime
- start the sandbox
- put tool execution under `/mnt/session`
- stop the sandbox when done

