from __future__ import annotations

from e2b import Template

template = (
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
    .run_cmd("python -m pip install --no-cache-dir 'anthropic>=0.103.0'")
    .run_cmd(
        "sudo mkdir -p /mnt/session /opt/anthropic-managed-agents && "
        "sudo chmod 777 /mnt/session /opt/anthropic-managed-agents"
    )
    .run_cmd("python --version && rg --version | head -1")
    .set_workdir("/mnt/session")
)

