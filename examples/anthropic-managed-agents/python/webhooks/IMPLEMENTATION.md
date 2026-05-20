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
        "WORKER_MAX_IDLE_SECONDS": "300",
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

```python
import os
import subprocess
from pathlib import Path

import anthropic
from fastapi import FastAPI, Request, Response

REMOTE_DIR = Path("/opt/anthropic-managed-agents")
REMOTE_WORKER = REMOTE_DIR / "worker.py"
REMOTE_PID = REMOTE_DIR / "worker.pid"
REMOTE_LOG = REMOTE_DIR / "worker.log"
MAX_WEBHOOK_BODY_BYTES = 1_048_576

app = FastAPI()
client = anthropic.Anthropic(api_key="not-needed")


def worker_env() -> dict[str, str]:
    keys = (
        "ANTHROPIC_ENVIRONMENT_ID",
        "ANTHROPIC_ENVIRONMENT_KEY",
        "WORKER_MAX_IDLE_SECONDS",
        "LOG_LEVEL",
        "PATH",
        "HOME",
    )
    return {key: value for key in keys if (value := os.environ.get(key))}


def worker_is_running() -> bool:
    if not REMOTE_PID.exists():
        return False
    try:
        pid = int(REMOTE_PID.read_text().strip())
    except ValueError:
        return False
    return Path(f"/proc/{pid}").exists()


def start_worker_if_needed() -> None:
    if worker_is_running():
        return

    with REMOTE_LOG.open("ab") as log_file:
        process = subprocess.Popen(
            ["python", str(REMOTE_WORKER)],
            cwd="/mnt/session",
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            env=worker_env(),
        )
    REMOTE_PID.write_text(f"{process.pid}\n")


async def read_limited_body(request: Request, max_bytes: int) -> str:
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > max_bytes:
        raise ValueError("request body too large")

    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > max_bytes:
            raise ValueError("request body too large")
        chunks.append(chunk)
    return b"".join(chunks).decode()


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True, "worker_running": worker_is_running()}


@app.post("/webhook")
async def webhook(request: Request) -> Response:
    signing_key = os.environ.get("ANTHROPIC_WEBHOOK_SIGNING_KEY")
    if not signing_key:
        return Response("ANTHROPIC_WEBHOOK_SIGNING_KEY is required", status_code=503)

    try:
        payload = await read_limited_body(request, MAX_WEBHOOK_BODY_BYTES)
    except ValueError:
        return Response("request body too large", status_code=413)

    try:
        event = client.beta.webhooks.unwrap(
            payload,
            headers=dict(request.headers),
            key=signing_key,
        )
    except Exception:
        return Response("invalid signature", status_code=401)

    if event.data.type == "session.status_run_started":
        start_worker_if_needed()

    return Response(status_code=204)
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
