from __future__ import annotations

import asyncio
import logging
import os

from anthropic import AsyncAnthropic

WORKDIR = "/mnt/session"


def max_idle_seconds() -> float | None:
    raw = os.environ.get("WORKER_MAX_IDLE_SECONDS", "30")
    if raw.lower() in {"", "none", "null"}:
        return None
    return float(raw)


def run_seconds() -> float | None:
    raw = os.environ.get("WORKER_RUN_SECONDS", "180")
    if raw.lower() in {"", "none", "null"}:
        return None
    return float(raw)


async def run_worker() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
    logger = logging.getLogger(__name__)

    environment_id = os.environ["ANTHROPIC_ENVIRONMENT_ID"]
    environment_key = os.environ["ANTHROPIC_ENVIRONMENT_KEY"]
    max_run_seconds = run_seconds()

    async with AsyncAnthropic(auth_token=environment_key) as client:
        worker = client.beta.environments.work.worker(
            environment_id=environment_id,
            environment_key=environment_key,
            workdir=WORKDIR,
            max_idle=max_idle_seconds(),
        )
        runner = (
            worker.handle_item(
                work_id=os.environ.get("ANTHROPIC_WORK_ID"),
                environment_id=environment_id,
                session_id=os.environ.get("ANTHROPIC_SESSION_ID"),
                environment_key=environment_key,
            )
            if os.environ.get("ANTHROPIC_WORK_ID") or os.environ.get("ANTHROPIC_SESSION_ID")
            else worker.run()
        )
        if max_run_seconds is None:
            await runner
            return

        try:
            await asyncio.wait_for(runner, timeout=max_run_seconds)
        except TimeoutError:
            logger.info("worker reached WORKER_RUN_SECONDS=%s; exiting", max_run_seconds)


def main() -> None:
    asyncio.run(run_worker())
