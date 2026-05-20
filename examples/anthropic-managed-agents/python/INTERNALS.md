# Internals

This example is intentionally small: the E2B-specific code starts a sandbox and runs Anthropic's SDK worker inside it. Anthropic's SDK owns the managed-agents queue loop.

The repo-facing examples are split by use case:

- `orchestrator/` documents the direct worker lifecycle where your app starts and stops E2B worker sandboxes.
- `webhooks/` documents the auto-resume webhook receiver that starts the worker when Anthropic sends `session.status_run_started`.

## Runtime Flow

```text
anthropic-managed-agents-create-environment  -> creates Anthropic self-hosted environment
anthropic-managed-agents-create-agent        -> creates a Claude Managed Agent with sandbox tools
anthropic-managed-agents-build-template      -> builds the E2B worker template
anthropic-managed-agents-start-worker        -> starts one E2B sandbox and launches the worker
anthropic-managed-agents-start-webhook-server -> starts an auto-resumable webhook receiver sandbox
anthropic-managed-agents-send-message        -> creates a session and streams events
anthropic-managed-agents-stop-worker         -> kills the worker sandbox
```

The implementation lives in the `anthropic_managed_agents_e2b` package. `pyproject.toml` exposes
the command-line entrypoints.

When `anthropic-managed-agents-send-message` creates a session with `environment_id`, Claude routes
tool calls for that session to the self-hosted environment. The E2B sandbox worker is already
connected to that environment and executes the tools under `/mnt/session`.

## File Map

| File | Responsibility |
| --- | --- |
| `anthropic_managed_agents_e2b/settings.py` | Loads `.env` and exposes typed settings used by the commands. |
| `anthropic_managed_agents_e2b/environment.py` | Creates the Anthropic self-hosted environment and formats the Console URL. |
| `anthropic_managed_agents_e2b/agent.py` | Creates a Managed Agent with the Anthropic sandbox toolset enabled. |
| `anthropic_managed_agents_e2b/template.py` | Defines the E2B template image and filesystem layout. |
| `anthropic_managed_agents_e2b/template_builder.py` | Builds the E2B template into a template name. |
| `anthropic_managed_agents_e2b/sandbox_worker.py` | Creates or reconnects an E2B sandbox, uploads worker code, and starts it with the environment key. |
| `anthropic_managed_agents_e2b/worker_runtime.py` | Runs Anthropic's async `EnvironmentWorker` inside the E2B sandbox. |
| `anthropic_managed_agents_e2b/webhook_runtime.py` | Verifies Anthropic webhooks and starts the worker on `session.status_run_started`. |
| `anthropic_managed_agents_e2b/session.py` | Creates a session and sends one user message for smoke testing. |
| `anthropic_managed_agents_e2b/cli.py` | Parses CLI arguments and wires settings into the package modules. |

## Functions

### `settings.py`

`load_settings()`

Loads environment variables from the repository root `.env` first, then from the example-local `.env`.
The local file wins when both exist. It returns a typed `Settings` object for Anthropic
credentials and resource IDs.

`Settings.require_*()`

Returns a required setting or raises a clear `RuntimeError`. The commands use these for values that
must exist before making API calls.

### `environment.py`

`create_self_hosted_environment(api_key, name)`

Creates an Anthropic environment with `config={"type": "self_hosted"}`. It prints:

- `ANTHROPIC_ENVIRONMENT_ID`
- the Anthropic Agents workspace URL for that environment
- the next step for generating `ANTHROPIC_ENVIRONMENT_KEY`

The SDK creates the environment, but the environment key is generated from the
[Anthropic Agents workspace](https://platform.claude.com/workspaces/default/agents).

### `agent.py`

`create_agent(api_key, name, model)`

Creates a Managed Agent using the requested model, defaulting to `claude-sonnet-4-6`.

The default system prompt tells Claude that `/mnt/session` is the sandbox workdir and that generated
artifacts should go under `/mnt/session/outputs` when useful. Anthropic's examples often use
`/workspace`; this example uses `/mnt/session` to match the E2B template workdir.

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

`worker_template()`

Defines the E2B template:

- starts from Python 3.12 slim
- installs shell utilities used by the sandbox tools
- installs `anthropic>=0.103.0`, `fastapi>=0.116.0`, and `uvicorn>=0.35.0`
- copies the packaged worker/webhook modules into `/opt/anthropic-managed-agents`
- creates writable `/mnt/session`
- creates `/opt/anthropic-managed-agents` for the worker and webhook server runtime
- sets `/mnt/session` as the default workdir

### `template_builder.py`

`build_template(template_name)`

Builds the E2B template with `Template.build()`. The default template name is
`anthropic-managed-agents`; pass `--template-name` to override it.

### `sandbox_worker.py`

`upload_worker(sandbox)`

Writes a small worker entrypoint and refreshes the packaged worker/webhook modules under
`/opt/anthropic-managed-agents`. The template already bakes these modules in; the upload keeps local
development changes usable without rebuilding the template every time.

`start_worker_process(sandbox, settings)`

Starts `worker.py` in the background inside the sandbox with:

- `ANTHROPIC_ENVIRONMENT_ID`
- `ANTHROPIC_ENVIRONMENT_KEY`
- worker max-idle value from `anthropic-managed-agents-start-worker --max-idle`
- log level from `anthropic-managed-agents-start-worker --log-level`

It redirects worker output to `/opt/anthropic-managed-agents/worker.log` and writes the background process id to `/opt/anthropic-managed-agents/worker.pid`.

`start_worker_sandbox(settings, template_name, timeout_seconds, worker_max_idle_seconds, log_level, sandbox_id)`

Creates a new E2B sandbox from the requested template, or reconnects to `--sandbox-id`. Then it uploads and starts the worker. It prints the worker sandbox ID for later cleanup.

`start_webhook_server_sandbox(settings, template_name, timeout_seconds, worker_max_idle_seconds, log_level, port, sandbox_id)`

Creates a new E2B sandbox with `lifecycle={"on_timeout": "pause", "auto_resume": True}`, or
reconnects to `--sandbox-id`. It uploads the same worker code plus the FastAPI webhook server and
starts Uvicorn. Register the printed `/webhook` URL in the
[Anthropic Agents workspace](https://platform.claude.com/workspaces/default/agents) for
`session.status_run_started`.

### `worker_runtime.py`

`max_idle_seconds()`

Parses `WORKER_MAX_IDLE_SECONDS`. Set it to `none`, `null`, or an empty string to disable the SDK worker's idle timeout.

`run_worker()`

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

### `webhook_runtime.py`

`webhook(request)`

Verifies Anthropic webhook deliveries using `client.beta.webhooks.unwrap(..., key=signing_key)`.
The server can start without `ANTHROPIC_WEBHOOK_SIGNING_KEY` so setup can print the public E2B URL
before the Anthropic webhook endpoint exists. Until the key is configured, `/webhook` returns `503`.
On `session.status_run_started`, it starts `worker.py` unless the worker pid is already running, then
returns `204`.

`health()`

Returns a small health response with whether the worker process is currently running.

### `session.py`

`is_end_turn(event)`

Returns `True` when the streamed session event is a final idle event with `stop_reason.type == "end_turn"`. The smoke driver uses this to stop streaming once Claude has finished the turn.

`stream_message(api_key, agent_id, environment_id, message)`

Creates a Managed Agents session using `ANTHROPIC_AGENT_ID` and `ANTHROPIC_ENVIRONMENT_ID`, sends a single user message, prints every streamed event, and exits on `end_turn`.

### `sandbox_worker.py`

`stop_worker_sandbox(sandbox_id)`

Kills the E2B worker sandbox. It accepts the sandbox id as a positional argument.

## Why This Shape

The main design choice is to run `EnvironmentWorker.run()` inside E2B instead of reimplementing Anthropic's work queue on the host. That keeps the example close to Anthropic's self-hosted environment model while still showing the E2B-specific pieces:

- build the worker runtime
- start the sandbox
- put tool execution under `/mnt/session`
- stop the sandbox when done
