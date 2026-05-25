from __future__ import annotations

from e2b import Template

REMOTE_DIR = "/opt/anthropic-managed-agents"
REMOTE_CONFIG_DIR = f"{REMOTE_DIR}/config"
REMOTE_PACKAGE_DIR = f"{REMOTE_DIR}/anthropic_managed_agents_e2b"
PACKAGE_FILES = [
    "__init__.py",
    "agent.py",
    "app_sandbox_store.py",
    "app_webhook_server.py",
    "cli.py",
    "environment.py",
    "sandbox_worker.py",
    "session.py",
    "settings.py",
    "template.py",
    "template_builder.py",
    "webhook_runtime.py",
    "worker_runtime.py",
]


def worker_template() -> Template:
    return (
        Template()
        .from_python_image("3.12-slim")
        .apt_install(
            [
                "bash",
                "ca-certificates",
                "coreutils",
                "curl",
                "git",
                "grep",
                "jq",
                "procps",
                "ripgrep",
                "sed",
                "sudo",
                "tree",
                "util-linux",
            ]
        )
        .run_cmd(
            "python -m pip install --no-cache-dir "
            "'anthropic[webhooks]>=0.103.0' 'fastapi>=0.116.0' 'uvicorn>=0.35.0'"
        )
        .run_cmd(
            "sudo mkdir -p /mnt/session /opt/anthropic-managed-agents "
            "/opt/anthropic-managed-agents/anthropic_managed_agents_e2b "
            "/opt/anthropic-managed-agents/config && "
            "sudo chmod 777 /mnt/session /opt/anthropic-managed-agents "
            "/opt/anthropic-managed-agents/anthropic_managed_agents_e2b && "
            "sudo chmod 700 /opt/anthropic-managed-agents/config"
        )
        .copy(PACKAGE_FILES, REMOTE_PACKAGE_DIR)
        .run_cmd("python --version && rg --version | head -1")
        .set_workdir("/mnt/session")
    )


template = worker_template()
