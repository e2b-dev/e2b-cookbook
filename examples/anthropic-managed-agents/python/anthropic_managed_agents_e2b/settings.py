from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import dotenv

PACKAGE_ROOT = Path(__file__).resolve().parent
EXAMPLE_ROOT = PACKAGE_ROOT.parent
REPO_ROOT = EXAMPLE_ROOT.parents[2]
DEFAULT_TEMPLATE_NAME = "anthropic-managed-agents"
DEFAULT_WORKER_MAX_IDLE_SECONDS = 300.0
DEFAULT_SANDBOX_TIMEOUT_SECONDS = 3600
DEFAULT_APP_SANDBOX_TIMEOUT_SECONDS = 300
DEFAULT_WEBHOOK_PORT = 8000
DEFAULT_LOG_LEVEL = "INFO"
MAX_WEBHOOK_BODY_BYTES = 1_048_576


def load_dotenv_files() -> None:
    dotenv.load_dotenv(REPO_ROOT / ".env", override=False)
    dotenv.load_dotenv(EXAMPLE_ROOT / ".env", override=True)


def _optional(name: str) -> str | None:
    value = os.environ.get(name)
    return value or None


@dataclass(frozen=True)
class Settings:
    anthropic_api_key: str | None
    anthropic_agent_id: str | None
    anthropic_environment_id: str | None
    anthropic_environment_key: str | None
    anthropic_webhook_signing_key: str | None
    app_webhook_admin_token: str | None
    app_sandbox_routing_scope: str | None

    def require(self, field_name: str, env_name: str) -> str:
        value = getattr(self, field_name)
        if value is None or value == "":
            raise RuntimeError(f"missing required environment variable: {env_name}")
        return value

    def require_anthropic_api_key(self) -> str:
        return self.require("anthropic_api_key", "ANTHROPIC_API_KEY")

    def require_anthropic_agent_id(self) -> str:
        return self.require("anthropic_agent_id", "ANTHROPIC_AGENT_ID")

    def require_anthropic_environment_id(self) -> str:
        return self.require("anthropic_environment_id", "ANTHROPIC_ENVIRONMENT_ID")

    def require_anthropic_environment_key(self) -> str:
        return self.require("anthropic_environment_key", "ANTHROPIC_ENVIRONMENT_KEY")

    def require_anthropic_webhook_signing_key(self) -> str:
        return self.require("anthropic_webhook_signing_key", "ANTHROPIC_WEBHOOK_SIGNING_KEY")


def load_settings() -> Settings:
    load_dotenv_files()
    return Settings(
        anthropic_api_key=_optional("ANTHROPIC_API_KEY"),
        anthropic_agent_id=_optional("ANTHROPIC_AGENT_ID"),
        anthropic_environment_id=_optional("ANTHROPIC_ENVIRONMENT_ID"),
        anthropic_environment_key=_optional("ANTHROPIC_ENVIRONMENT_KEY"),
        anthropic_webhook_signing_key=_optional("ANTHROPIC_WEBHOOK_SIGNING_KEY"),
        app_webhook_admin_token=_optional("APP_WEBHOOK_ADMIN_TOKEN"),
        app_sandbox_routing_scope=_optional("APP_SANDBOX_ROUTING_SCOPE"),
    )
