from __future__ import annotations

from anthropic_managed_agents_e2b.settings import (
    DEFAULT_LOG_LEVEL,
    DEFAULT_SANDBOX_TIMEOUT_SECONDS,
    DEFAULT_TEMPLATE_NAME,
    DEFAULT_WORKER_MAX_IDLE_SECONDS,
    load_settings,
    require_env,
)

settings = load_settings()

ANTHROPIC_API_KEY = settings.anthropic_api_key
ANTHROPIC_AGENT_ID = settings.anthropic_agent_id
ANTHROPIC_ENVIRONMENT_ID = settings.anthropic_environment_id
ANTHROPIC_ENVIRONMENT_KEY = settings.anthropic_environment_key
ANTHROPIC_WEBHOOK_SIGNING_KEY = settings.anthropic_webhook_signing_key

E2B_TEMPLATE_NAME = DEFAULT_TEMPLATE_NAME
E2B_WORKER_SANDBOX_ID = None

WORKER_MAX_IDLE_SECONDS = DEFAULT_WORKER_MAX_IDLE_SECONDS
SANDBOX_TIMEOUT_SECONDS = DEFAULT_SANDBOX_TIMEOUT_SECONDS
LOG_LEVEL = DEFAULT_LOG_LEVEL

__all__ = [
    "ANTHROPIC_AGENT_ID",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_ENVIRONMENT_ID",
    "ANTHROPIC_ENVIRONMENT_KEY",
    "ANTHROPIC_WEBHOOK_SIGNING_KEY",
    "E2B_TEMPLATE_NAME",
    "E2B_WORKER_SANDBOX_ID",
    "LOG_LEVEL",
    "SANDBOX_TIMEOUT_SECONDS",
    "WORKER_MAX_IDLE_SECONDS",
    "require_env",
]
