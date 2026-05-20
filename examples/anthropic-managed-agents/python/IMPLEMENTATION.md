# Functions to Implement

This is the implementation checklist for wiring Anthropic Managed Agents self-hosted environments
to E2B in Python. The local example implements these functions under
[`anthropic_managed_agents_e2b/`](./anthropic_managed_agents_e2b/).

## 1. Load Runtime Configuration

Implement `load_settings()`.

It should load local environment variables and return a typed settings object with:

| Setting | Required for |
| --- | --- |
| `ANTHROPIC_API_KEY` | Creating agents, creating environments, sending sessions, updating environment metadata. |
| `ANTHROPIC_AGENT_ID` | Sending a session message. |
| `ANTHROPIC_ENVIRONMENT_ID` | Starting workers, sending sessions, metadata lookup. |
| `ANTHROPIC_ENVIRONMENT_KEY` | Running the self-hosted environment worker. |
| `ANTHROPIC_WEBHOOK_SIGNING_KEY` | Verifying real webhook deliveries. |

The example reads the repository root `.env` first, then the example-local `.env`.

## 2. Create the Anthropic Environment

Implement `create_self_hosted_environment(api_key, name)`.

It should call:

```python
client.beta.environments.create(
    name=name,
    config={"type": "self_hosted"},
)
```

Print the returned `env.id` as `ANTHROPIC_ENVIRONMENT_ID`, then send the user to
[Anthropic Environments](https://platform.claude.com/workspaces/default/environments) to generate
`ANTHROPIC_ENVIRONMENT_KEY`.

## 3. Create the Managed Agent

Implement `create_agent(api_key, name, model)`.

It should create a Managed Agent with:

- the target model
- a system prompt that says `/mnt/session` is the sandbox workdir
- Anthropic's `agent_toolset_20260401`
- enabled tools: `bash`, `read`, `write`, `edit`, `glob`, `grep`, `web_fetch`, `web_search`

For this cookbook example, the tool permission policy is `always_allow` so the smoke flow can run
without an approval UI.

## 4. Build the E2B Template

Implement `worker_template()` and `build_template(template_name)`.

The template should:

- start from Python 3.12
- install shell utilities used by the Anthropic toolset
- install `anthropic[webhooks]`, `fastapi`, and `uvicorn`
- copy the worker and webhook runtime modules into `/opt/anthropic-managed-agents`
- create writable `/mnt/session`
- set `/mnt/session` as the default workdir

`build_template(template_name)` should call E2B's `Template.build(...)` with that template.

## 5. Start an Orchestrator Worker Sandbox

Implement `start_worker_sandbox(settings, template_name, timeout_seconds, worker_max_idle_seconds, log_level, sandbox_id)`.

It should:

1. Require `ANTHROPIC_ENVIRONMENT_ID` and `ANTHROPIC_ENVIRONMENT_KEY`.
2. Connect to `sandbox_id` if provided, otherwise create a new E2B sandbox from `template_name`.
3. Upload or refresh the worker runtime files.
4. Start the worker process in the background inside `/mnt/session`.
5. Write the worker pid to `/opt/anthropic-managed-agents/worker.pid`.
6. Write logs to `/opt/anthropic-managed-agents/worker.log`.
7. Update Anthropic environment metadata:

```text
e2b_worker_sandbox_id=<sandbox id>
e2b_worker_sandbox_ids=["<sandbox id>", ...]
```

The process environment passed to the worker must include:

```text
ANTHROPIC_ENVIRONMENT_ID
ANTHROPIC_ENVIRONMENT_KEY
WORKER_MAX_IDLE_SECONDS
LOG_LEVEL
```

## 6. Run the Worker Inside E2B

Implement `run_worker()`.

It should run Anthropic's SDK worker:

```python
async with AsyncAnthropic(auth_token=environment_key) as client:
    worker = client.beta.environments.work.worker(
        environment_id=environment_id,
        environment_key=environment_key,
        workdir="/mnt/session",
        unrestricted_paths=True,
        max_idle=max_idle_seconds(),
    )
    await worker.run()
```

This is the core handoff. Anthropic's SDK owns polling, claiming work, heartbeating, dispatching
tool calls, and sending tool results back to the session.

## 7. Start an Auto-Resume Webhook Sandbox

Implement `start_webhook_server_sandbox(settings, template_name, timeout_seconds, worker_max_idle_seconds, log_level, port, sandbox_id)`.

It should:

1. Require `ANTHROPIC_ENVIRONMENT_ID` and `ANTHROPIC_ENVIRONMENT_KEY`.
2. Connect to `sandbox_id` if provided, otherwise create an E2B sandbox with:

```python
lifecycle={"on_timeout": "pause", "auto_resume": True}
```

3. Upload or refresh the worker and webhook runtime files.
4. Start the webhook server in the background.
5. Print `https://<sandbox-host>/webhook`.
6. Update Anthropic environment metadata:

```text
e2b_webhook_sandbox_id=<sandbox id>
e2b_webhook_sandbox_ids=["<sandbox id>", ...]
```

## 8. Verify Webhooks and Start the Worker

Implement `webhook(request)`.

It should:

1. Return `503` when `ANTHROPIC_WEBHOOK_SIGNING_KEY` is not configured.
2. Read the raw request body.
3. Verify the payload with:

```python
event = client.beta.webhooks.unwrap(
    payload,
    headers=dict(request.headers),
    key=signing_key,
)
```

4. If `event.data.type == "session.status_run_started"`, start the worker process if it is not already running.
5. Return `204` for accepted webhook deliveries.

Also implement `health()` so setup can confirm the webhook sandbox is serving HTTP.

## 9. App-Owned Webhook Routing

Implement `app_webhook_server.py` when webhooks should land on your application instead of inside
an E2B sandbox.

It should:

1. Receive `POST /webhook` in the app process.
2. Verify the raw Anthropic webhook payload with `client.beta.webhooks.unwrap(...)`.
3. Read `event.data.id` as the Managed Agents session id.
4. Look up that session id in an app-owned sandbox store.
5. Reconnect to that session's sandbox and start the worker if needed, or create a fresh worker
   sandbox when the assignment is missing or stale.

This keeps webhook policy, routing, observability, and sandbox replacement under app control while
still using the same E2B worker runtime. Add `GET /sandboxes` so operators can inspect the current
session-to-sandbox assignments.

## 10. Send a Session Message

Implement `stream_message(api_key, agent_id, environment_id, message)`.

It should:

1. Create a session with `agent` and `environment_id`.
2. Open a session event stream.
3. Send a `user.message`.
4. Print streamed events.
5. Stop when the stream reaches `session.status_idle` with `stop_reason.type == "end_turn"`.

## 11. Upload Files into the E2B Worker Sandbox

Anthropic session `resources` are not available for self-hosted environments. For this E2B pattern,
upload files through E2B before sending the session message:

```python
from pathlib import Path
from e2b import Sandbox


def upload_file_to_sandbox(sandbox_id: str, local_path: Path, remote_path: str):
    sandbox = Sandbox.connect(sandbox_id)
    sandbox.files.write(remote_path, local_path.read_bytes())
    return remote_path
```

Then ask the agent to read the remote path, for example
`/mnt/session/uploads/example-input.txt`.

## 12. Look Up and Clean Up Sandbox Metadata

Implement:

- `retrieve_environment(api_key, environment_id)`
- `update_environment_metadata(api_key, environment_id, metadata)`
- `clear_matching_sandbox_metadata(api_key, environment_id, sandbox_id)`
- `upload_file_to_sandbox(sandbox_id, local_path, remote_path)`
- `show_environment_main()`

`show_environment_main()` should print:

```text
ANTHROPIC_ENVIRONMENT_ID=...
name=...
e2b_worker_sandbox_id=...
e2b_worker_sandbox_ids=...
e2b_webhook_sandbox_id=...
e2b_webhook_sandbox_ids=...
```

`stop_worker_sandbox(settings, sandbox_id)` should kill the E2B sandbox and clear
`e2b_worker_sandbox_id` or `e2b_webhook_sandbox_id` only when the stored value matches the sandbox
being stopped. It should also remove the sandbox id from the matching JSON metadata list.

That gives another process a simple lookup path:

```text
ANTHROPIC_ENVIRONMENT_ID -> environment.metadata.e2b_*_sandbox_ids -> E2B sandbox ids
```
