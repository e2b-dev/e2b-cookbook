from __future__ import annotations

import argparse
import shlex
from pathlib import Path

from e2b import Sandbox

from config import (
    ANTHROPIC_ENVIRONMENT_ID,
    E2B_TEMPLATE_NAME,
    LOG_LEVEL,
    SANDBOX_TIMEOUT_SECONDS,
    WORKER_MAX_IDLE_SECONDS,
    require_env,
)

ROOT = Path(__file__).resolve().parent
REMOTE_DIR = "/opt/anthropic-managed-agents"
REMOTE_WORKER = f"{REMOTE_DIR}/worker.py"
REMOTE_PID = f"{REMOTE_DIR}/worker.pid"
REMOTE_LOG = f"{REMOTE_DIR}/worker.log"


def upload_worker(sandbox: Sandbox) -> None:
    sandbox.files.write(REMOTE_WORKER, (ROOT / "worker.py").read_text())


def start_worker(sandbox: Sandbox) -> None:
    envs = {
        "ANTHROPIC_ENVIRONMENT_ID": require_env("ANTHROPIC_ENVIRONMENT_ID"),
        "ANTHROPIC_ENVIRONMENT_KEY": require_env("ANTHROPIC_ENVIRONMENT_KEY"),
        "WORKER_MAX_IDLE_SECONDS": str(WORKER_MAX_IDLE_SECONDS),
        "LOG_LEVEL": LOG_LEVEL,
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Start an Anthropic worker inside E2B.")
    parser.add_argument("--sandbox-id", help="Reconnect to an existing worker sandbox")
    args = parser.parse_args()

    require_env("ANTHROPIC_ENVIRONMENT_ID")
    require_env("ANTHROPIC_ENVIRONMENT_KEY")

    if args.sandbox_id:
        sandbox = Sandbox.connect(args.sandbox_id, timeout=SANDBOX_TIMEOUT_SECONDS)
    else:
        sandbox = Sandbox.create(
            E2B_TEMPLATE_NAME,
            timeout=SANDBOX_TIMEOUT_SECONDS,
            metadata={
                "managed_by": "anthropic-managed-agents-e2b",
                "anthropic.environment_id": ANTHROPIC_ENVIRONMENT_ID or "",
            },
        )

    upload_worker(sandbox)
    start_worker(sandbox)
    print(f"E2B_WORKER_SANDBOX_ID={sandbox.sandbox_id}")
    print(f"Worker log: {REMOTE_LOG}")


if __name__ == "__main__":
    main()
