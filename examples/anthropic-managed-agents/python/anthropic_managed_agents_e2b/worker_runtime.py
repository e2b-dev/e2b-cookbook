from __future__ import annotations

import asyncio
import logging
import os

from anthropic import AsyncAnthropic

WORKDIR = "/mnt/session"


def max_idle_seconds() -> float | None:
    raw = os.environ.get("WORKER_MAX_IDLE_SECONDS", "300")
    if raw.lower() in {"", "none", "null"}:
        return None
    return float(raw)


async def run_worker() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))

    environment_id = os.environ["ANTHROPIC_ENVIRONMENT_ID"]
    environment_key = os.environ["ANTHROPIC_ENVIRONMENT_KEY"]

    async with AsyncAnthropic(auth_token=environment_key) as client:
        worker = client.beta.environments.work.worker(
            environment_id=environment_id,
            environment_key=environment_key,
            workdir=WORKDIR,
            unrestricted_paths=True,
            max_idle=max_idle_seconds(),
        )
        await worker.run()


def main() -> None:
    asyncio.run(run_worker())
