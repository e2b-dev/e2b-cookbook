from __future__ import annotations

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
