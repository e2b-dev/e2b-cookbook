# Python App-Owned Webhook Implementation

This is the complete app-owned webhook shape: Anthropic calls your app, your app verifies the
webhook, then your app routes work to an E2B worker sandbox.

## App Webhook Server

```python
import anthropic
from fastapi import FastAPI, Request, Response

from anthropic_managed_agents_e2b.environment import (
    WORKER_SANDBOX_METADATA_KEY,
    retrieve_environment,
)
from anthropic_managed_agents_e2b.sandbox_worker import ensure_worker_sandbox
from anthropic_managed_agents_e2b.settings import (
    DEFAULT_LOG_LEVEL,
    DEFAULT_SANDBOX_TIMEOUT_SECONDS,
    DEFAULT_TEMPLATE_NAME,
    DEFAULT_WORKER_MAX_IDLE_SECONDS,
    load_settings,
)

app = FastAPI()


def current_worker_sandbox_id(settings):
    environment = retrieve_environment(
        api_key=settings.require_anthropic_api_key(),
        environment_id=settings.require_anthropic_environment_id(),
    )
    return environment.metadata.get(WORKER_SANDBOX_METADATA_KEY)


def ensure_worker_for_event(settings):
    return ensure_worker_sandbox(
        settings,
        template_name=DEFAULT_TEMPLATE_NAME,
        timeout_seconds=DEFAULT_SANDBOX_TIMEOUT_SECONDS,
        worker_max_idle_seconds=DEFAULT_WORKER_MAX_IDLE_SECONDS,
        log_level=DEFAULT_LOG_LEVEL,
        sandbox_id=current_worker_sandbox_id(settings),
    )


@app.post("/webhook")
async def webhook(request: Request) -> Response:
    settings = load_settings()
    signing_key = settings.anthropic_webhook_signing_key
    if not signing_key:
        return Response("ANTHROPIC_WEBHOOK_SIGNING_KEY is required", status_code=503)

    payload = (await request.body()).decode()
    client = anthropic.Anthropic(api_key=settings.require_anthropic_api_key())

    try:
        event = client.beta.webhooks.unwrap(
            payload,
            headers=dict(request.headers),
            key=signing_key,
        )
    except Exception:
        return Response("invalid signature", status_code=400)

    if event.data.type == "session.status_run_started":
        sandbox = ensure_worker_for_event(settings)
        return Response(status_code=204, headers={"x-e2b-worker-sandbox-id": sandbox.sandbox_id})

    return Response(status_code=204)
```

## Worker Routing

The app uses environment metadata as the lookup table:

```python
def current_worker_sandbox_id(settings):
    environment = retrieve_environment(
        api_key=settings.require_anthropic_api_key(),
        environment_id=settings.require_anthropic_environment_id(),
    )
    return environment.metadata.get("e2b_worker_sandbox_id")
```

Then it calls `ensure_worker_sandbox(...)`. That helper:

1. Reconnects to the stored sandbox id when metadata exists.
2. Uploads the current worker runtime into the sandbox.
3. Checks `/opt/anthropic-managed-agents/worker.pid`.
4. Starts the worker only when no live worker process is found.
5. Creates a fresh sandbox and updates metadata if the stored id cannot be reconnected.

```python
def ensure_worker_sandbox(settings, *, sandbox_id: str | None, **options):
    try:
        return start_worker_sandbox(settings, sandbox_id=sandbox_id, **options)
    except Exception:
        if sandbox_id is None:
            raise
        return start_worker_sandbox(settings, **options)
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

Your app must verify the raw body and headers with `client.beta.webhooks.unwrap(...)` before it
starts or reconnects any sandbox.
