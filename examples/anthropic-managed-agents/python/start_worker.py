from __future__ import annotations

from anthropic_managed_agents_e2b.cli import start_worker_main as main
from anthropic_managed_agents_e2b.sandbox_worker import start_worker_process, upload_worker
from anthropic_managed_agents_e2b.settings import (
    DEFAULT_LOG_LEVEL,
    DEFAULT_WORKER_MAX_IDLE_SECONDS,
    load_settings,
)


def start_worker(sandbox) -> None:
    start_worker_process(
        sandbox,
        load_settings(),
        worker_max_idle_seconds=DEFAULT_WORKER_MAX_IDLE_SECONDS,
        log_level=DEFAULT_LOG_LEVEL,
    )


__all__ = ["main", "start_worker", "upload_worker"]


if __name__ == "__main__":
    main()
