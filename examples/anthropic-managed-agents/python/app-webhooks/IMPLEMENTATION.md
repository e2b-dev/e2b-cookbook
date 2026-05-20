# Python App-Owned Webhook Implementation

This walkthrough includes every app-webhook-specific piece of code. It assumes the shared Python
package from the parent example already exists: settings loading, Anthropic environment helpers,
template build, and the E2B worker runtime. Add the files and edits below to turn that base worker
package into this flow:

```text
Anthropic webhook -> your app -> app-owned sandbox store -> E2B worker sandbox
```

The app-owned store lets your app reconnect to the same worker sandbox for a repeated
`session.status_run_started` webhook. The Anthropic worker in this example still polls at the
self-hosted environment level, so this is app-owned sandbox lifecycle control rather than a hard
session-affinity guarantee.

## 1. Add the App Webhook Server

Create `anthropic_managed_agents_e2b/app_webhook_server.py`:

```python
from __future__ import annotations

from threading import Lock

import anthropic
from fastapi import FastAPI, Request, Response

from anthropic_managed_agents_e2b.app_sandbox_store import JsonSandboxStore
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
store = JsonSandboxStore()
worker_locks: dict[tuple[str, str], Lock] = {}
worker_locks_lock = Lock()


def _settings() -> Settings:
    return load_settings()


def _webhook_client(settings: Settings) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.require_anthropic_api_key())


def _session_id(event: object) -> str:
    data = getattr(event, "data", None)
    session_id = getattr(data, "id", None)
    if not session_id:
        raise RuntimeError("webhook event does not include data.id")
    return str(session_id)


def ensure_worker_for_event(settings: Settings, event: object):
    environment_id = settings.require_anthropic_environment_id()
    session_id = _session_id(event)
    with worker_locks_lock:
        worker_lock = worker_locks.setdefault((environment_id, session_id), Lock())

    with worker_lock:
        return _ensure_worker_for_session(settings, environment_id, session_id)


def _ensure_worker_for_session(settings: Settings, environment_id: str, session_id: str):
    assignment = store.get(environment_id=environment_id, session_id=session_id)
    sandbox = ensure_worker_sandbox(
        settings,
        template_name=DEFAULT_TEMPLATE_NAME,
        timeout_seconds=DEFAULT_SANDBOX_TIMEOUT_SECONDS,
        worker_max_idle_seconds=DEFAULT_WORKER_MAX_IDLE_SECONDS,
        log_level=DEFAULT_LOG_LEVEL,
        sandbox_id=assignment.sandbox_id if assignment else None,
    )
    store.upsert(
        environment_id=environment_id,
        session_id=session_id,
        sandbox_id=sandbox.sandbox_id,
    )
    return sandbox


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/sandboxes")
def sandboxes() -> dict[str, list[dict[str, str]]]:
    return {"sandboxes": [assignment.__dict__ for assignment in store.list()]}


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
        try:
            sandbox = ensure_worker_for_event(settings, event)
        except Exception:
            return Response("failed to start worker sandbox", status_code=500)
        return Response(
            status_code=204,
            headers={"x-e2b-worker-sandbox-id": sandbox.sandbox_id},
        )

    return Response(status_code=204)
```

Create `anthropic_managed_agents_e2b/app_sandbox_store.py` for the app-owned assignments:

```python
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock

from anthropic_managed_agents_e2b.settings import EXAMPLE_ROOT

DEFAULT_STORE_PATH = EXAMPLE_ROOT / ".managed-agent-sandbox-store.json"


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _store_path() -> Path:
    return Path(os.environ.get("APP_SANDBOX_STORE_PATH", DEFAULT_STORE_PATH))


@dataclass(frozen=True)
class SandboxAssignment:
    environment_id: str
    session_id: str
    sandbox_id: str
    status: str
    created_at: str
    updated_at: str


class JsonSandboxStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _store_path()
        self._lock = Lock()

    def list(self) -> list[SandboxAssignment]:
        with self._lock:
            return self._read()

    def get(self, *, environment_id: str, session_id: str) -> SandboxAssignment | None:
        with self._lock:
            for assignment in self._read():
                if assignment.environment_id == environment_id and assignment.session_id == session_id:
                    return assignment
        return None

    def upsert(self, *, environment_id: str, session_id: str, sandbox_id: str):
        with self._lock:
            assignments = self._read()
            now = _now()
            existing = next(
                (
                    item
                    for item in assignments
                    if item.environment_id == environment_id and item.session_id == session_id
                ),
                None,
            )
            assignment = SandboxAssignment(
                environment_id=environment_id,
                session_id=session_id,
                sandbox_id=sandbox_id,
                status="active",
                created_at=existing.created_at if existing else now,
                updated_at=now,
            )
            self._write(
                [
                    item
                    for item in assignments
                    if not (
                        item.environment_id == environment_id and item.session_id == session_id
                    )
                ]
                + [assignment]
            )
            return assignment

    def remove_sandbox(self, *, sandbox_id: str) -> None:
        with self._lock:
            self._write([item for item in self._read() if item.sandbox_id != sandbox_id])

    def _read(self) -> list[SandboxAssignment]:
        if not self.path.exists():
            return []
        raw = json.loads(self.path.read_text())
        if not isinstance(raw, list):
            return []
        return [SandboxAssignment(**item) for item in raw if isinstance(item, dict)]

    def _write(self, assignments: list[SandboxAssignment]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps([asdict(item) for item in assignments], indent=2, sort_keys=True) + "\n"
        )
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
        add_sandbox_to_metadata_store(
            api_key=settings.anthropic_api_key,
            environment_id=settings.require_anthropic_environment_id(),
            legacy_key=WORKER_SANDBOX_METADATA_KEY,
            store_key=WORKER_SANDBOX_STORE_METADATA_KEY,
            sandbox_id=sandbox.sandbox_id,
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

Create `.env` in the parent `python/` directory with:

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
uv sync --project ..
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
make stop-worker SANDBOX_ID="<sandbox-id-from-show-environment-or-sandboxes>"
```
