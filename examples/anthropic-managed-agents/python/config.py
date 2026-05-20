from __future__ import annotations

import os
from pathlib import Path

import dotenv

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parents[2]

dotenv.load_dotenv(REPO_ROOT / ".env", override=False)
dotenv.load_dotenv(ROOT / ".env", override=True)


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if value is None or value == "":
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_AGENT_ID = os.environ.get("ANTHROPIC_AGENT_ID")
ANTHROPIC_ENVIRONMENT_ID = os.environ.get("ANTHROPIC_ENVIRONMENT_ID")
ANTHROPIC_ENVIRONMENT_KEY = os.environ.get("ANTHROPIC_ENVIRONMENT_KEY")

E2B_TEMPLATE_NAME = os.environ.get("E2B_TEMPLATE_NAME", "anthropic-managed-agents")
E2B_WORKER_SANDBOX_ID = os.environ.get("E2B_WORKER_SANDBOX_ID")

WORKER_MAX_IDLE_SECONDS = float(os.environ.get("WORKER_MAX_IDLE_SECONDS", "300"))
SANDBOX_TIMEOUT_SECONDS = int(os.environ.get("SANDBOX_TIMEOUT_SECONDS", "3600"))
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

