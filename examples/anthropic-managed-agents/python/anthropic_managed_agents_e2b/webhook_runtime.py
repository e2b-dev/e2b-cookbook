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


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True, "worker_running": worker_is_running()}


@app.post("/webhook")
async def webhook(request: Request) -> Response:
    signing_key = os.environ.get("ANTHROPIC_WEBHOOK_SIGNING_KEY")
    if not signing_key:
        return Response("ANTHROPIC_WEBHOOK_SIGNING_KEY is required", status_code=503)

    payload = (await request.body()).decode()
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
