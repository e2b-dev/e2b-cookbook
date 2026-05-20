# Python App Worker Implementation

This is the complete app/orchestrator shape: your process creates Anthropic resources, starts an
E2B sandbox worker, sends sessions, optionally mounts uploaded files, and stops the sandbox.

## Create Anthropic Resources

```python
import anthropic

SANDBOX_TOOLS = ("bash", "read", "write", "edit", "glob", "grep")
WEB_TOOLS = ("web_fetch", "web_search")


def create_environment(api_key: str, name: str):
    client = anthropic.Anthropic(api_key=api_key)
    return client.beta.environments.create(
        name=name,
        config={"type": "self_hosted"},
    )


def create_agent(api_key: str, name: str, model: str = "claude-sonnet-4-6"):
    client = anthropic.Anthropic(api_key=api_key)
    return client.beta.agents.create(
        name=name,
        model=model,
        system=(
            "You have a Linux sandbox. Use /mnt/session as the working directory. "
            "Write generated artifacts under /mnt/session/outputs when useful. "
            "Use the available tools to complete the task."
        ),
        tools=[
            {
                "type": "agent_toolset_20260401",
                "default_config": {
                    "enabled": False,
                    "permission_policy": {"type": "always_allow"},
                },
                "configs": [
                    {
                        "name": tool,
                        "enabled": True,
                        "permission_policy": {"type": "always_allow"},
                    }
                    for tool in (*SANDBOX_TOOLS, *WEB_TOOLS)
                ],
            }
        ],
    )
```

## Build the E2B Template

```python
from e2b import Template


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
            "/opt/anthropic-managed-agents/anthropic_managed_agents_e2b && "
            "sudo chmod 777 /mnt/session /opt/anthropic-managed-agents "
            "/opt/anthropic-managed-agents/anthropic_managed_agents_e2b"
        )
        .copy(
            [
                "__init__.py",
                "worker_runtime.py",
                "webhook_runtime.py",
            ],
            "/opt/anthropic-managed-agents/anthropic_managed_agents_e2b",
        )
        .set_workdir("/mnt/session")
    )


def build_template(template_name: str = "anthropic-managed-agents"):
    return Template.build(worker_template(), template_name)
```

## Run the Worker Inside E2B

This is the code that runs in the sandbox:

```python
import asyncio
import os

from anthropic import AsyncAnthropic


def max_idle_seconds() -> float | None:
    raw = os.environ.get("WORKER_MAX_IDLE_SECONDS", "300")
    if raw.lower() in {"", "none", "null"}:
        return None
    return float(raw)


async def run_worker() -> None:
    environment_id = os.environ["ANTHROPIC_ENVIRONMENT_ID"]
    environment_key = os.environ["ANTHROPIC_ENVIRONMENT_KEY"]

    async with AsyncAnthropic(auth_token=environment_key) as client:
        worker = client.beta.environments.work.worker(
            environment_id=environment_id,
            environment_key=environment_key,
            workdir="/mnt/session",
            unrestricted_paths=True,
            max_idle=max_idle_seconds(),
        )
        await worker.run()


asyncio.run(run_worker())
```

## Start the Worker Sandbox

```python
import shlex

from e2b import Sandbox


def start_worker_sandbox(
    *,
    anthropic_api_key: str,
    environment_id: str,
    environment_key: str,
    template_name: str = "anthropic-managed-agents",
) -> Sandbox:
    sandbox = Sandbox.create(
        template_name,
        timeout=3600,
        metadata={
            "managed_by": "anthropic-managed-agents-e2b",
            "anthropic.environment_id": environment_id,
        },
    )

    sandbox.files.write(
        "/opt/anthropic-managed-agents/worker.py",
        "from anthropic_managed_agents_e2b.worker_runtime import main\n\nmain()\n",
    )

    command = """
    set -eu
    cd /mnt/session
    nohup python /opt/anthropic-managed-agents/worker.py \
      > /opt/anthropic-managed-agents/worker.log 2>&1 < /dev/null &
    printf '%s\\n' "$!" > /opt/anthropic-managed-agents/worker.pid
    """
    sandbox.commands.run(
        f"bash -lc {shlex.quote(command)}",
        envs={
            "ANTHROPIC_ENVIRONMENT_ID": environment_id,
            "ANTHROPIC_ENVIRONMENT_KEY": environment_key,
            "WORKER_MAX_IDLE_SECONDS": "300",
            "LOG_LEVEL": "INFO",
        },
        timeout=15,
    )

    client = anthropic.Anthropic(api_key=anthropic_api_key)
    client.beta.environments.update(
        environment_id,
        metadata={"e2b_worker_sandbox_id": sandbox.sandbox_id},
    )

    return sandbox
```

## Send a Session Message

```python
def send_message(api_key: str, agent_id: str, environment_id: str, message: str):
    client = anthropic.Anthropic(api_key=api_key)
    session = client.beta.sessions.create(
        agent=agent_id,
        environment_id=environment_id,
    )

    with client.beta.sessions.events.stream(session.id) as stream:
        client.beta.sessions.events.send(
            session.id,
            events=[
                {
                    "type": "user.message",
                    "content": [{"type": "text", "text": message}],
                }
            ],
        )

        for event in stream:
            print(event)
            if (
                getattr(event, "type", None) == "session.status_idle"
                and getattr(getattr(event, "stop_reason", None), "type", None) == "end_turn"
            ):
                break
```

## Upload a File into the E2B Worker Sandbox

Anthropic session `resources` are not supported for self-hosted environments. Upload files through
E2B into the worker sandbox, then ask the agent to read the path.

```python
from pathlib import Path
from e2b import Sandbox


def upload_file_to_sandbox(sandbox_id: str, local_path: Path, remote_path: str):
    sandbox = Sandbox.connect(sandbox_id)
    sandbox.files.write(remote_path, local_path.read_bytes())
    return remote_path
```

After upload, send a normal session message:

```python
send_message(
    api_key=api_key,
    agent_id=agent_id,
    environment_id=environment_id,
    message="Read /mnt/session/uploads/example-input.txt and echo the exact contents",
)
```

## Stop and Clear Metadata

```python
def stop_worker(api_key: str, environment_id: str, sandbox_id: str):
    Sandbox.kill(sandbox_id)

    client = anthropic.Anthropic(api_key=api_key)
    env = client.beta.environments.retrieve(environment_id)
    metadata = {}
    for key in ("e2b_worker_sandbox_id", "e2b_webhook_sandbox_id"):
        if env.metadata.get(key) == sandbox_id:
            metadata[key] = None

    if metadata:
        client.beta.environments.update(environment_id, metadata=metadata)
```
