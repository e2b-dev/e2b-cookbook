# Python App-Owned Webhook Implementation

This walkthrough includes every app-webhook-specific piece of code. It assumes the shared Python
package from the parent example already exists: settings loading, Anthropic environment helpers,
template build, and the E2B worker runtime. Add the files and edits below to turn that base worker
package into this flow:

```text
Anthropic webhook -> your app -> Anthropic environment metadata -> E2B worker sandbox
```

## 1. Add the App Webhook Server

Create `anthropic_managed_agents_e2b/app_webhook_server.py`:

```python
from __future__ import annotations

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
    Settings,
    load_settings,
)

app = FastAPI()


def _settings() -> Settings:
    return load_settings()


def _webhook_client(settings: Settings) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.require_anthropic_api_key())


def _current_worker_sandbox_id(settings: Settings) -> str | None:
    environment = retrieve_environment(
        api_key=settings.require_anthropic_api_key(),
        environment_id=settings.require_anthropic_environment_id(),
    )
    return environment.metadata.get(WORKER_SANDBOX_METADATA_KEY)


def ensure_worker_for_event(settings: Settings):
    return ensure_worker_sandbox(
        settings,
        template_name=DEFAULT_TEMPLATE_NAME,
        timeout_seconds=DEFAULT_SANDBOX_TIMEOUT_SECONDS,
        worker_max_idle_seconds=DEFAULT_WORKER_MAX_IDLE_SECONDS,
        log_level=DEFAULT_LOG_LEVEL,
        sandbox_id=_current_worker_sandbox_id(settings),
    )


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/webhook")
async def webhook(request: Request) -> Response:
    settings = _settings()
    signing_key = settings.anthropic_webhook_signing_key
    if not signing_key:
        return Response("ANTHROPIC_WEBHOOK_SIGNING_KEY is required", status_code=503)
    payload = (await request.body()).decode()

    try:
        event = _webhook_client(settings).beta.webhooks.unwrap(
            payload,
            headers=dict(request.headers),
            key=signing_key,
        )
    except Exception:
        return Response("invalid signature", status_code=400)

    if event.data.type == "session.status_run_started":
        sandbox = ensure_worker_for_event(settings)
        return Response(
            status_code=204,
            headers={"x-e2b-worker-sandbox-id": sandbox.sandbox_id},
        )

    return Response(status_code=204)
```

## 2. Add Worker Ensure Helpers

Add these functions to `anthropic_managed_agents_e2b/sandbox_worker.py`. They reuse the same E2B
worker runtime as the orchestrator example, but make the operation idempotent for repeated
webhooks.

```python
def worker_process_is_running(sandbox: Sandbox) -> bool:
    check = f"""
    set -eu
    test -f {shlex.quote(REMOTE_PID)}
    pid="$(cat {shlex.quote(REMOTE_PID)})"
    test -n "$pid"
    kill -0 "$pid"
    """
    result = sandbox.commands.run(f"bash -lc {shlex.quote(check)}", timeout=5)
    return result.exit_code == 0


def ensure_worker_process(
    sandbox: Sandbox,
    settings: Settings,
    *,
    worker_max_idle_seconds: float | None,
    log_level: str,
) -> None:
    upload_worker(sandbox)
    if worker_process_is_running(sandbox):
        return
    start_worker_process(
        sandbox,
        settings,
        worker_max_idle_seconds=worker_max_idle_seconds,
        log_level=log_level,
    )


def ensure_worker_sandbox(
    settings: Settings,
    *,
    template_name: str,
    timeout_seconds: int,
    worker_max_idle_seconds: float | None,
    log_level: str,
    sandbox_id: str | None = None,
) -> Sandbox:
    try:
        return start_worker_sandbox(
            settings,
            template_name=template_name,
            timeout_seconds=timeout_seconds,
            worker_max_idle_seconds=worker_max_idle_seconds,
            log_level=log_level,
            sandbox_id=sandbox_id,
        )
    except Exception:
        if sandbox_id is None:
            raise
        return start_worker_sandbox(
            settings,
            template_name=template_name,
            timeout_seconds=timeout_seconds,
            worker_max_idle_seconds=worker_max_idle_seconds,
            log_level=log_level,
        )
```

Then update `start_worker_sandbox(...)` so it calls `ensure_worker_process(...)` instead of always
starting a new worker process:

```python
def start_worker_sandbox(
    settings: Settings,
    *,
    template_name: str,
    timeout_seconds: int,
    worker_max_idle_seconds: float | None,
    log_level: str,
    sandbox_id: str | None = None,
) -> Sandbox:
    settings.require_anthropic_environment_id()
    settings.require_anthropic_environment_key()
    sandbox = create_or_connect_worker_sandbox(
        settings,
        template_name=template_name,
        timeout_seconds=timeout_seconds,
        sandbox_id=sandbox_id,
    )
    ensure_worker_process(
        sandbox,
        settings,
        worker_max_idle_seconds=worker_max_idle_seconds,
        log_level=log_level,
    )
    if settings.anthropic_api_key:
        update_environment_metadata(
            api_key=settings.anthropic_api_key,
            environment_id=settings.require_anthropic_environment_id(),
            metadata={WORKER_SANDBOX_METADATA_KEY: sandbox.sandbox_id},
        )
    return sandbox
```

## 3. Add the CLI Entrypoint

Add this function to `anthropic_managed_agents_e2b/cli.py`:

```python
def start_app_webhook_server_main() -> None:
    parser = argparse.ArgumentParser(
        description="Start an app-owned webhook server that routes work to an E2B worker sandbox."
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    load_settings()
    import uvicorn

    uvicorn.run(
        "anthropic_managed_agents_e2b.app_webhook_server:app",
        host=args.host,
        port=args.port,
    )
```

Expose it in `pyproject.toml`:

```toml
[project.scripts]
anthropic-managed-agents-start-app-webhook-server = "anthropic_managed_agents_e2b.cli:start_app_webhook_server_main"
```

## 4. Add the Use-Case Makefile

Create `app-webhooks/Makefile`:

```make
.PHONY: build-template show-environment start-app-webhook-server stop-worker

build-template:
	uv run --project .. anthropic-managed-agents-build-template

show-environment:
	uv run --project .. anthropic-managed-agents-show-environment

start-app-webhook-server:
	uv run --project .. anthropic-managed-agents-start-app-webhook-server

stop-worker:
	uv run --project .. anthropic-managed-agents-stop-worker $(SANDBOX_ID)
```

## 5. Configure Runtime Values

Create `../.env` with:

```bash
E2B_API_KEY="..."
E2B_ACCESS_TOKEN="..."
ANTHROPIC_API_KEY="..."
ANTHROPIC_ENVIRONMENT_ID="env_..."
ANTHROPIC_ENVIRONMENT_KEY="..."
ANTHROPIC_WEBHOOK_SIGNING_KEY="..."
```

Create the Anthropic environment in the [Anthropic Environments workspace](https://platform.claude.com/workspaces/default/environments).
Create the webhook endpoint in the [Anthropic Agents workspace](https://platform.claude.com/workspaces/default/agents)
and subscribe it to `session.status_run_started`.

## 6. Run It

```bash
uv sync
make build-template
make start-app-webhook-server
```

Expose `http://localhost:8000/webhook` through your app deployment or a tunnel, then register the
public `https://.../webhook` URL with Anthropic.

Check the app server:

```bash
curl http://127.0.0.1:8000/health
```

Stop the active worker sandbox when done:

```bash
make show-environment
make stop-worker SANDBOX_ID="<e2b_worker_sandbox_id>"
```
