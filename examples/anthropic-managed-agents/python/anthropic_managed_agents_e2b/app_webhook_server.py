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
