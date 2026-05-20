from __future__ import annotations

import shlex

from e2b import Sandbox

from anthropic_managed_agents_e2b.settings import PACKAGE_ROOT, Settings

REMOTE_DIR = "/opt/anthropic-managed-agents"
REMOTE_PACKAGE_DIR = f"{REMOTE_DIR}/anthropic_managed_agents_e2b"
REMOTE_WORKER = f"{REMOTE_DIR}/worker.py"
REMOTE_PID = f"{REMOTE_DIR}/worker.pid"
REMOTE_LOG = f"{REMOTE_DIR}/worker.log"
REMOTE_WEBHOOK_PID = f"{REMOTE_DIR}/webhook.pid"
REMOTE_WEBHOOK_LOG = f"{REMOTE_DIR}/webhook.log"
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
    upload_worker(sandbox)
    start_worker_process(
        sandbox,
        settings,
        worker_max_idle_seconds=worker_max_idle_seconds,
        log_level=log_level,
    )
    return sandbox


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
    start_webhook_server_process(
        sandbox,
        settings,
        worker_max_idle_seconds=worker_max_idle_seconds,
        log_level=log_level,
        port=port,
    )
    return sandbox


def stop_worker_sandbox(sandbox_id: str) -> None:
    Sandbox.kill(sandbox_id)
