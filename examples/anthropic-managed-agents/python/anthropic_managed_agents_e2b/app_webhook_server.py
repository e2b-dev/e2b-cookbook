from __future__ import annotations

import asyncio
import hmac
import logging
from threading import Lock

import anthropic
from fastapi import FastAPI, HTTPException, Request, Response

from anthropic_managed_agents_e2b.app_sandbox_store import JsonSandboxStore
from anthropic_managed_agents_e2b.sandbox_worker import ensure_worker_sandbox
from anthropic_managed_agents_e2b.settings import (
    DEFAULT_LOG_LEVEL,
    DEFAULT_SANDBOX_TIMEOUT_SECONDS,
    DEFAULT_TEMPLATE_NAME,
    DEFAULT_WORKER_MAX_IDLE_SECONDS,
    MAX_WEBHOOK_BODY_BYTES,
    Settings,
    load_settings,
)

app = FastAPI()
store = JsonSandboxStore()
worker_locks: dict[tuple[str, str, str], Lock] = {}
worker_locks_lock = Lock()
logger = logging.getLogger(__name__)
ROUTING_SCOPES = {"session", "agent", "environment"}


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


def _routing_scope(settings: Settings) -> str:
    scope = settings.app_sandbox_routing_scope or "session"
    if scope not in ROUTING_SCOPES:
        raise RuntimeError("APP_SANDBOX_ROUTING_SCOPE must be session, agent, or environment")
    return scope


def _routing_target(settings: Settings, session_id: str) -> tuple[str, str, str]:
    configured_environment_id = settings.require_anthropic_environment_id()
    scope = _routing_scope(settings)
    if scope == "session":
        return configured_environment_id, scope, session_id
    if scope == "environment":
        return configured_environment_id, scope, configured_environment_id

    session = _webhook_client(settings).beta.sessions.retrieve(session_id)
    if session.environment_id != configured_environment_id:
        raise RuntimeError(
            f"session {session_id} belongs to {session.environment_id}, "
            f"but this worker is configured for {configured_environment_id}"
        )
    return session.environment_id, scope, session.agent.id


def ensure_worker_for_event(settings: Settings, event: object):
    session_id = _session_id(event)
    environment_id, routing_scope, routing_id = _routing_target(settings, session_id)
    with worker_locks_lock:
        worker_lock = worker_locks.setdefault((environment_id, routing_scope, routing_id), Lock())

    with worker_lock:
        return _ensure_worker_for_target(
            settings, environment_id, routing_scope, routing_id, session_id
        )


def _ensure_worker_for_target(
    settings: Settings,
    environment_id: str,
    routing_scope: str,
    routing_id: str,
    session_id: str,
):
    assignment = store.get(
        environment_id=environment_id, routing_scope=routing_scope, routing_id=routing_id
    )
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
        routing_scope=routing_scope,
        routing_id=routing_id,
        session_id=session_id,
        sandbox_id=sandbox.sandbox_id,
    )
    return sandbox


def _log_background_worker_result(task: asyncio.Task[object]) -> None:
    try:
        sandbox = task.result()
    except Exception:
        logger.exception("failed to start worker sandbox")
        return

    logger.info("started worker sandbox %s", getattr(sandbox, "sandbox_id", ""))


async def _read_limited_body(request: Request, max_bytes: int) -> str:
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


def _has_admin_access(request: Request, settings: Settings) -> bool:
    expected = settings.app_webhook_admin_token
    authorization = request.headers.get("authorization", "")
    prefix = "Bearer "
    actual = authorization[len(prefix) :] if authorization.startswith(prefix) else ""
    return bool(expected and actual and hmac.compare_digest(expected, actual))


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/sandboxes")
def sandboxes(request: Request) -> dict[str, list[dict[str, str]]]:
    if not _has_admin_access(request, _settings()):
        raise HTTPException(status_code=401, detail="unauthorized")

    return {"sandboxes": [assignment.__dict__ for assignment in store.list()]}


@app.post("/webhook")
async def webhook(request: Request) -> Response:
    settings = _settings()
    signing_key = settings.anthropic_webhook_signing_key
    if not signing_key:
        return Response("ANTHROPIC_WEBHOOK_SIGNING_KEY is required", status_code=503)
    try:
        payload = await _read_limited_body(request, MAX_WEBHOOK_BODY_BYTES)
    except ValueError:
        return Response("request body too large", status_code=413)

    try:
        event = _webhook_client(settings).beta.webhooks.unwrap(
            payload,
            headers=dict(request.headers),
            key=signing_key,
        )
    except Exception:
        logger.exception("invalid webhook signature")
        return Response("invalid signature", status_code=401)

    if event.data.type == "session.status_run_started":
        task = asyncio.create_task(asyncio.to_thread(ensure_worker_for_event, settings, event))
        task.add_done_callback(_log_background_worker_result)
        return Response(status_code=204)

    return Response(status_code=204)
