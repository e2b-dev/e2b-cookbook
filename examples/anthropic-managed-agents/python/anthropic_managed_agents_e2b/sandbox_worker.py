from __future__ import annotations

import logging
import shlex
from pathlib import Path

from e2b import Sandbox

from anthropic_managed_agents_e2b.app_sandbox_store import JsonSandboxStore
from anthropic_managed_agents_e2b.environment import (
    WEBHOOK_SANDBOX_METADATA_KEY,
    WEBHOOK_SANDBOX_STORE_METADATA_KEY,
    WORKER_SANDBOX_METADATA_KEY,
    WORKER_SANDBOX_STORE_METADATA_KEY,
    add_sandbox_to_metadata_store,
    clear_matching_sandbox_metadata,
)
from anthropic_managed_agents_e2b.settings import PACKAGE_ROOT, Settings

REMOTE_DIR = "/opt/anthropic-managed-agents"
REMOTE_WORKDIR = "/mnt/session"
REMOTE_PACKAGE_DIR = f"{REMOTE_DIR}/anthropic_managed_agents_e2b"
REMOTE_WORKER = f"{REMOTE_DIR}/worker.py"
REMOTE_PID = f"{REMOTE_DIR}/worker.pid"
REMOTE_LOG = f"{REMOTE_DIR}/worker.log"
REMOTE_WEBHOOK_PID = f"{REMOTE_DIR}/webhook.pid"
REMOTE_WEBHOOK_LOG = f"{REMOTE_DIR}/webhook.log"
REMOTE_ENVIRONMENT_ID = f"{REMOTE_WORKDIR}/.anthropic-environment-id"
REMOTE_ENVIRONMENT_KEY = f"{REMOTE_WORKDIR}/.anthropic-environment-key"
REMOTE_WEBHOOK_SIGNING_KEY = f"{REMOTE_WORKDIR}/.anthropic-webhook-signing-key"
REMOTE_WORKER_MAX_IDLE_SECONDS = f"{REMOTE_WORKDIR}/.worker-max-idle-seconds"
REMOTE_LOG_LEVEL = f"{REMOTE_WORKDIR}/.log-level"
logger = logging.getLogger(__name__)
REMOTE_WORKER_ENTRYPOINT = """\
from anthropic_managed_agents_e2b.worker_runtime import main

if __name__ == "__main__":
    main()
"""


def create_or_connect_worker_sandbox(
    settings: Settings,
    *,
    template_name: str,
    timeout_seconds: int,
    sandbox_id: str | None = None,
) -> Sandbox:
    if sandbox_id:
        return Sandbox.connect(sandbox_id, timeout=timeout_seconds)

    return Sandbox.create(
        template_name,
        timeout=timeout_seconds,
        lifecycle={"on_timeout": "pause", "auto_resume": True},
        metadata={
            "managed_by": "anthropic-managed-agents-e2b",
            "anthropic.environment_id": settings.anthropic_environment_id or "",
        },
    )


def upload_worker(sandbox: Sandbox) -> None:
    sandbox.commands.run(f"mkdir -p {shlex.quote(REMOTE_PACKAGE_DIR)}", timeout=15)
    sandbox.files.write(REMOTE_WORKER, REMOTE_WORKER_ENTRYPOINT)
    sandbox.files.write(
        f"{REMOTE_PACKAGE_DIR}/__init__.py",
        (PACKAGE_ROOT / "__init__.py").read_text(),
    )
    sandbox.files.write(
        f"{REMOTE_PACKAGE_DIR}/worker_runtime.py",
        (PACKAGE_ROOT / "worker_runtime.py").read_text(),
    )
    sandbox.files.write(
        f"{REMOTE_PACKAGE_DIR}/webhook_runtime.py",
        (PACKAGE_ROOT / "webhook_runtime.py").read_text(),
    )


def start_worker_process(
    sandbox: Sandbox,
    settings: Settings,
    *,
    worker_max_idle_seconds: float | None,
    log_level: str,
) -> None:
    envs = {
        "ANTHROPIC_ENVIRONMENT_ID": settings.require_anthropic_environment_id(),
        "ANTHROPIC_ENVIRONMENT_KEY": settings.require_anthropic_environment_key(),
        "WORKER_MAX_IDLE_SECONDS": "none"
        if worker_max_idle_seconds is None
        else str(worker_max_idle_seconds),
        "LOG_LEVEL": log_level,
    }
    wrapper = f"""
    set -eu
    cd /mnt/session
    nohup python {shlex.quote(REMOTE_WORKER)} > {shlex.quote(REMOTE_LOG)} 2>&1 < /dev/null &
    printf '%s\\n' "$!" > {shlex.quote(REMOTE_PID)}
    """
    result = sandbox.commands.run(f"bash -lc {shlex.quote(wrapper)}", envs=envs, timeout=15)
    if result.exit_code not in (0, None):
        raise RuntimeError(f"worker start failed:\n{result.stdout}\n{result.stderr}")


def worker_process_is_running(sandbox: Sandbox) -> bool:
    check = (
        f"test -f {shlex.quote(REMOTE_PID)} && "
        f'pid="$(cat {shlex.quote(REMOTE_PID)})" && '
        'test -n "$pid" && '
        'kill -0 "$pid"'
    )
    try:
        result = sandbox.commands.run(f"bash -lc {shlex.quote(check)}", timeout=5)
    except Exception:
        return False
    return result.exit_code == 0


def ensure_worker_process(
    sandbox: Sandbox,
    settings: Settings,
    *,
    worker_max_idle_seconds: float | None,
    log_level: str,
) -> None:
    upload_worker(sandbox)
    if worker_process_is_running(sandbox):
        return
    start_worker_process(
        sandbox,
        settings,
        worker_max_idle_seconds=worker_max_idle_seconds,
        log_level=log_level,
    )


def start_worker_sandbox(
    settings: Settings,
    *,
    template_name: str,
    timeout_seconds: int,
    worker_max_idle_seconds: float | None,
    log_level: str,
    sandbox_id: str | None = None,
) -> Sandbox:
    settings.require_anthropic_environment_id()
    settings.require_anthropic_environment_key()
    sandbox = create_or_connect_worker_sandbox(
        settings,
        template_name=template_name,
        timeout_seconds=timeout_seconds,
        sandbox_id=sandbox_id,
    )
    ensure_worker_process(
        sandbox,
        settings,
        worker_max_idle_seconds=worker_max_idle_seconds,
        log_level=log_level,
    )
    if settings.anthropic_api_key:
        add_sandbox_to_metadata_store(
            api_key=settings.anthropic_api_key,
            environment_id=settings.require_anthropic_environment_id(),
            legacy_key=WORKER_SANDBOX_METADATA_KEY,
            store_key=WORKER_SANDBOX_STORE_METADATA_KEY,
            sandbox_id=sandbox.sandbox_id,
        )
    return sandbox


def ensure_worker_sandbox(
    settings: Settings,
    *,
    template_name: str,
    timeout_seconds: int,
    worker_max_idle_seconds: float | None,
    log_level: str,
    sandbox_id: str | None = None,
) -> Sandbox:
    if sandbox_id:
        try:
            return start_worker_sandbox(
                settings,
                template_name=template_name,
                timeout_seconds=timeout_seconds,
                worker_max_idle_seconds=worker_max_idle_seconds,
                log_level=log_level,
                sandbox_id=sandbox_id,
            )
        except Exception:
            logger.exception(
                "failed to connect worker sandbox %s; creating a replacement",
                sandbox_id,
            )

    return start_worker_sandbox(
        settings,
        template_name=template_name,
        timeout_seconds=timeout_seconds,
        worker_max_idle_seconds=worker_max_idle_seconds,
        log_level=log_level,
    )


def start_webhook_server_process(
    sandbox: Sandbox,
    settings: Settings,
    *,
    worker_max_idle_seconds: float | None,
    log_level: str,
    port: int,
) -> None:
    envs = {
        "ANTHROPIC_ENVIRONMENT_ID": settings.require_anthropic_environment_id(),
        "ANTHROPIC_ENVIRONMENT_KEY": settings.require_anthropic_environment_key(),
        "WORKER_MAX_IDLE_SECONDS": "none"
        if worker_max_idle_seconds is None
        else str(worker_max_idle_seconds),
        "LOG_LEVEL": log_level,
    }
    if settings.anthropic_webhook_signing_key:
        envs["ANTHROPIC_WEBHOOK_SIGNING_KEY"] = settings.anthropic_webhook_signing_key
    uvicorn_command = (
        "python -m uvicorn anthropic_managed_agents_e2b.webhook_runtime:app "
        f"--host 0.0.0.0 --port {port} > {shlex.quote(REMOTE_WEBHOOK_LOG)} "
        "2>&1 < /dev/null &"
    )
    wrapper = f"""
    set -eu
    cd /opt/anthropic-managed-agents
    nohup {uvicorn_command}
    printf '%s\\n' "$!" > {shlex.quote(REMOTE_WEBHOOK_PID)}
    """
    result = sandbox.commands.run(f"bash -lc {shlex.quote(wrapper)}", envs=envs, timeout=15)
    if result.exit_code not in (0, None):
        raise RuntimeError(f"webhook server start failed:\n{result.stdout}\n{result.stderr}")


def write_webhook_config(
    sandbox: Sandbox,
    settings: Settings,
    *,
    worker_max_idle_seconds: float | None,
    log_level: str,
) -> None:
    sandbox.files.write(
        REMOTE_ENVIRONMENT_ID,
        f"{settings.require_anthropic_environment_id()}\n",
    )
    sandbox.files.write(
        REMOTE_ENVIRONMENT_KEY,
        f"{settings.require_anthropic_environment_key()}\n",
    )
    sandbox.files.write(
        REMOTE_WORKER_MAX_IDLE_SECONDS,
        "none\n" if worker_max_idle_seconds is None else f"{worker_max_idle_seconds}\n",
    )
    sandbox.files.write(REMOTE_LOG_LEVEL, f"{log_level}\n")
    if settings.anthropic_webhook_signing_key:
        sandbox.files.write(
            REMOTE_WEBHOOK_SIGNING_KEY,
            f"{settings.anthropic_webhook_signing_key}\n",
        )


def start_webhook_server_sandbox(
    settings: Settings,
    *,
    template_name: str,
    timeout_seconds: int,
    worker_max_idle_seconds: float | None,
    log_level: str,
    port: int,
    sandbox_id: str | None = None,
) -> Sandbox:
    settings.require_anthropic_environment_id()
    settings.require_anthropic_environment_key()

    if sandbox_id:
        sandbox = Sandbox.connect(sandbox_id, timeout=timeout_seconds)
    else:
        sandbox = Sandbox.create(
            template_name,
            timeout=timeout_seconds,
            lifecycle={"on_timeout": "pause", "auto_resume": True},
            metadata={
                "managed_by": "anthropic-managed-agents-e2b-webhook",
                "anthropic.environment_id": settings.anthropic_environment_id or "",
            },
        )

    upload_worker(sandbox)
    write_webhook_config(
        sandbox,
        settings,
        worker_max_idle_seconds=worker_max_idle_seconds,
        log_level=log_level,
    )
    start_webhook_server_process(
        sandbox,
        settings,
        worker_max_idle_seconds=worker_max_idle_seconds,
        log_level=log_level,
        port=port,
    )
    if settings.anthropic_api_key:
        add_sandbox_to_metadata_store(
            api_key=settings.anthropic_api_key,
            environment_id=settings.require_anthropic_environment_id(),
            legacy_key=WEBHOOK_SANDBOX_METADATA_KEY,
            store_key=WEBHOOK_SANDBOX_STORE_METADATA_KEY,
            sandbox_id=sandbox.sandbox_id,
        )
    return sandbox


def stop_worker_sandbox(settings: Settings, sandbox_id: str) -> None:
    Sandbox.kill(sandbox_id)
    JsonSandboxStore().remove_sandbox(sandbox_id=sandbox_id)
    if settings.anthropic_api_key and settings.anthropic_environment_id:
        clear_matching_sandbox_metadata(
            api_key=settings.anthropic_api_key,
            environment_id=settings.anthropic_environment_id,
            sandbox_id=sandbox_id,
        )


def upload_file_to_sandbox(*, sandbox_id: str, local_path: Path, remote_path: str) -> str:
    sandbox = Sandbox.connect(sandbox_id)
    sandbox.files.write(remote_path, local_path.read_bytes())
    return remote_path
