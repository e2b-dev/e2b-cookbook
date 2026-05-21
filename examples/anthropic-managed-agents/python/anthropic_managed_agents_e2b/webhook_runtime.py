from __future__ import annotations

import os
import subprocess
import threading
from pathlib import Path

import anthropic
from fastapi import FastAPI, Request, Response

REMOTE_DIR = Path("/opt/anthropic-managed-agents")
REMOTE_WORKDIR = Path("/mnt/session")
REMOTE_WORKER = REMOTE_DIR / "worker.py"
REMOTE_PID = REMOTE_DIR / "worker.pid"
REMOTE_PIDS_DIR = REMOTE_DIR / "worker-pids"
REMOTE_LOG = REMOTE_DIR / "worker.log"
REMOTE_ENVIRONMENT_ID = REMOTE_WORKDIR / ".anthropic-environment-id"
REMOTE_ENVIRONMENT_KEY = REMOTE_WORKDIR / ".anthropic-environment-key"
REMOTE_WEBHOOK_SIGNING_KEY = REMOTE_WORKDIR / ".anthropic-webhook-signing-key"
REMOTE_WORKER_MAX_IDLE_SECONDS = REMOTE_WORKDIR / ".worker-max-idle-seconds"
REMOTE_LOG_LEVEL = REMOTE_WORKDIR / ".log-level"
MAX_WEBHOOK_BODY_BYTES = 1_048_576
MAX_WORKERS = max(1, int(os.environ.get("MAX_WORKERS", "4")))
WORKER_RETRY_SECONDS = 5

app = FastAPI()
client = anthropic.Anthropic(api_key="not-needed")
pending_worker_starts = 0
worker_retry_timer: threading.Timer | None = None


def file_value(path: Path) -> str | None:
    if not path.exists():
        return None
    value = path.read_text().strip()
    return value or None


def config_value(name: str, path: Path) -> str | None:
    return os.environ.get(name) or file_value(path)


def worker_env() -> dict[str, str]:
    env = {
        "ANTHROPIC_ENVIRONMENT_ID": config_value(
            "ANTHROPIC_ENVIRONMENT_ID",
            REMOTE_ENVIRONMENT_ID,
        ),
        "ANTHROPIC_ENVIRONMENT_KEY": config_value(
            "ANTHROPIC_ENVIRONMENT_KEY",
            REMOTE_ENVIRONMENT_KEY,
        ),
        "WORKER_MAX_IDLE_SECONDS": config_value(
            "WORKER_MAX_IDLE_SECONDS",
            REMOTE_WORKER_MAX_IDLE_SECONDS,
        ),
        "WORKER_RUN_SECONDS": os.environ.get("WORKER_RUN_SECONDS"),
        "LOG_LEVEL": config_value("LOG_LEVEL", REMOTE_LOG_LEVEL),
        "PATH": os.environ.get("PATH"),
        "HOME": os.environ.get("HOME"),
    }
    return {key: value for key, value in env.items() if value is not None}


def process_is_running(pid: int) -> bool:
    return pid > 0 and Path(f"/proc/{pid}").exists()


def pid_file_value(path: Path) -> int | None:
    try:
        return int(path.read_text().strip())
    except (OSError, ValueError):
        return None


def active_worker_pids() -> list[int]:
    REMOTE_PIDS_DIR.mkdir(parents=True, exist_ok=True)
    pids: list[int] = []

    for path in REMOTE_PIDS_DIR.iterdir():
        pid = pid_file_value(path)
        if pid is not None and process_is_running(pid):
            pids.append(pid)
        else:
            path.unlink(missing_ok=True)

    latest_pid = pid_file_value(REMOTE_PID)
    if latest_pid is not None and process_is_running(latest_pid) and latest_pid not in pids:
        pids.append(latest_pid)

    return pids


def schedule_worker_retry() -> None:
    global worker_retry_timer

    if worker_retry_timer is not None or pending_worker_starts == 0:
        return

    worker_retry_timer = threading.Timer(
        WORKER_RETRY_SECONDS,
        lambda: start_worker_if_capacity(retrying_pending_start=True),
    )
    worker_retry_timer.daemon = True
    worker_retry_timer.start()


def cleanup_worker_on_exit(process: subprocess.Popen[bytes]) -> None:
    process.wait()
    (REMOTE_PIDS_DIR / f"{process.pid}.pid").unlink(missing_ok=True)
    schedule_worker_retry()


def start_worker_if_capacity(*, retrying_pending_start: bool = False) -> None:
    global pending_worker_starts, worker_retry_timer

    if retrying_pending_start:
        worker_retry_timer = None

    if len(active_worker_pids()) >= MAX_WORKERS:
        if not retrying_pending_start:
            pending_worker_starts = min(pending_worker_starts + 1, MAX_WORKERS)
        schedule_worker_retry()
        return

    if retrying_pending_start:
        pending_worker_starts = max(0, pending_worker_starts - 1)

    with REMOTE_LOG.open("ab") as log_file:
        process = subprocess.Popen(
            ["python", str(REMOTE_WORKER)],
            cwd=REMOTE_WORKDIR,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            env=worker_env(),
        )
    REMOTE_PID.write_text(f"{process.pid}\n")
    (REMOTE_PIDS_DIR / f"{process.pid}.pid").write_text(f"{process.pid}\n")
    threading.Thread(target=cleanup_worker_on_exit, args=(process,), daemon=True).start()
    schedule_worker_retry()


def webhook_signing_key() -> str | None:
    key_file = Path(
        os.environ.get("ANTHROPIC_WEBHOOK_SIGNING_KEY_FILE", REMOTE_WEBHOOK_SIGNING_KEY)
    )
    return config_value("ANTHROPIC_WEBHOOK_SIGNING_KEY", key_file)


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
def health() -> dict[str, bool | int]:
    pids = active_worker_pids()
    return {"ok": True, "worker_running": len(pids) > 0, "worker_count": len(pids)}


@app.post("/webhook")
async def webhook(request: Request) -> Response:
    signing_key = webhook_signing_key()
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
        start_worker_if_capacity()

    return Response(status_code=204)
