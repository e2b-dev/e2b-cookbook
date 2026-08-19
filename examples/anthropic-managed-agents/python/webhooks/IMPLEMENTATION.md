# Python Webhook Worker Implementation

This is the complete webhook shape: start an auto-resumable E2B sandbox, expose `/webhook`, verify
Anthropic's signed event, and start the SDK worker when Anthropic sends
`session.status_run_started`.

## Start the Auto-Resume E2B Sandbox

```python
import anthropic
from e2b import Sandbox


def start_webhook_sandbox(
    *,
    anthropic_api_key: str,
    environment_id: str,
    environment_key: str,
    webhook_signing_key: str | None,
    template_name: str = "anthropic-managed-agents",
    port: int = 8000,
) -> Sandbox:
    sandbox = Sandbox.create(
        template_name,
        timeout=3600,
        lifecycle={"on_timeout": "pause", "auto_resume": True},
        metadata={
            "managed_by": "anthropic-managed-agents-e2b-webhook",
            "anthropic.environment_id": environment_id,
        },
    )

    envs = {
        "ANTHROPIC_ENVIRONMENT_ID": environment_id,
        "ANTHROPIC_ENVIRONMENT_KEY": environment_key,
        "WORKER_MAX_IDLE_SECONDS": "30",
        "LOG_LEVEL": "INFO",
    }
    if webhook_signing_key:
        envs["ANTHROPIC_WEBHOOK_SIGNING_KEY"] = webhook_signing_key

    sandbox.commands.run(
        "bash -lc 'cd /opt/anthropic-managed-agents && "
        "nohup python -m uvicorn anthropic_managed_agents_e2b.webhook_runtime:app "
        f"--host 0.0.0.0 --port {port} "
        "> /opt/anthropic-managed-agents/webhook.log 2>&1 < /dev/null & "
        "printf %s\\\\n \"$!\" > /opt/anthropic-managed-agents/webhook.pid'",
        envs=envs,
        timeout=15,
    )

    client = anthropic.Anthropic(api_key=anthropic_api_key)
    client.beta.environments.update(
        environment_id,
        metadata={"e2b_webhook_sandbox_id": sandbox.sandbox_id},
    )

    print(f"Anthropic webhook URL: https://{sandbox.get_host(port)}/webhook")
    return sandbox
```

## Webhook Server

`webhook_runtime.py` keeps three operational rules explicit:

1. Read at most `MAX_WEBHOOK_BODY_BYTES` before signature verification.
2. Verify with `client.beta.webhooks.unwrap(payload, headers=..., key=...)`.
3. Start one worker process per signed `session.status_run_started` event, capped by
   `MAX_WORKERS` and retried when the sandbox is already at capacity.

The process environment is allowlisted. The webhook server reads the Anthropic environment id,
environment key, webhook signing key, worker idle timeout, and log level either from environment
variables or from these files in `/opt/anthropic-managed-agents/config`, outside the agent workdir:

```text
anthropic-environment-id
anthropic-environment-key
anthropic-webhook-signing-key
worker-max-idle-seconds
log-level
```

That file-backed path lets the app update a resumed webhook sandbox without baking secrets or an
Anthropic API key into the E2B template.

`GET /health` returns:

```json
{"ok": true, "worker_running": true, "worker_count": 2}
```

## What Anthropic Sends

```json
{
  "id": "event_...",
  "type": "event",
  "created_at": "2026-05-20T09:44:28.000000Z",
  "data": {
    "type": "session.status_run_started",
    "id": "sesn_...",
    "workspace_id": "wrkspc_...",
    "organization_id": "org_..."
  }
}
```

Anthropic also sends signature headers. Pass the raw body and request headers to
`client.beta.webhooks.unwrap(...)`; do not parse and reserialize the JSON before verification.

## Stop and Clear Metadata

```python
def stop_webhook_sandbox(api_key: str, environment_id: str, sandbox_id: str):
    Sandbox.kill(sandbox_id)

    client = anthropic.Anthropic(api_key=api_key)
    env = client.beta.environments.retrieve(environment_id)
    if env.metadata.get("e2b_webhook_sandbox_id") == sandbox_id:
        client.beta.environments.update(
            environment_id,
            metadata={"e2b_webhook_sandbox_id": None},
        )
```
