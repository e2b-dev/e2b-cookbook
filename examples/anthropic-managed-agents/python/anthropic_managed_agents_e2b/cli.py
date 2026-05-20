from __future__ import annotations

import argparse
from pathlib import Path

from anthropic_managed_agents_e2b.agent import DEFAULT_MODEL, create_agent
from anthropic_managed_agents_e2b.environment import (
    WEBHOOK_SANDBOX_METADATA_KEY,
    WEBHOOK_SANDBOX_STORE_METADATA_KEY,
    WORKER_SANDBOX_METADATA_KEY,
    WORKER_SANDBOX_STORE_METADATA_KEY,
    console_url,
    create_self_hosted_environment,
    retrieve_environment,
    sandbox_store,
)
from anthropic_managed_agents_e2b.sandbox_worker import (
    REMOTE_LOG,
    REMOTE_WEBHOOK_LOG,
    start_webhook_server_sandbox,
    start_worker_sandbox,
    stop_worker_sandbox,
    upload_file_to_sandbox,
)
from anthropic_managed_agents_e2b.session import stream_message
from anthropic_managed_agents_e2b.settings import (
    DEFAULT_LOG_LEVEL,
    DEFAULT_SANDBOX_TIMEOUT_SECONDS,
    DEFAULT_TEMPLATE_NAME,
    DEFAULT_WEBHOOK_PORT,
    DEFAULT_WORKER_MAX_IDLE_SECONDS,
    load_settings,
)
from anthropic_managed_agents_e2b.template_builder import build_template


def _max_idle_arg(value: str) -> float | None:
    if value.lower() in {"", "none", "null"}:
        return None
    return float(value)


def create_environment_main() -> None:
    parser = argparse.ArgumentParser(description="Create an Anthropic self-hosted environment.")
    parser.add_argument("name", help="Environment name")
    args = parser.parse_args()

    settings = load_settings()
    env = create_self_hosted_environment(
        api_key=settings.require_anthropic_api_key(),
        name=args.name,
    )

    print(f"ANTHROPIC_ENVIRONMENT_ID={env.id}")
    print(f"Claude Console: {console_url(env.id)}")
    print("Open the Console URL and generate ANTHROPIC_ENVIRONMENT_KEY.")


def show_environment_main() -> None:
    parser = argparse.ArgumentParser(description="Show Anthropic environment metadata.")
    parser.parse_args()

    settings = load_settings()
    env = retrieve_environment(
        api_key=settings.require_anthropic_api_key(),
        environment_id=settings.require_anthropic_environment_id(),
    )

    print(f"ANTHROPIC_ENVIRONMENT_ID={env.id}")
    print(f"name={env.name}")
    print(f"{WORKER_SANDBOX_METADATA_KEY}={env.metadata.get(WORKER_SANDBOX_METADATA_KEY, '')}")
    worker_sandbox_ids = sandbox_store(
        env.metadata,
        store_key=WORKER_SANDBOX_STORE_METADATA_KEY,
        legacy_key=WORKER_SANDBOX_METADATA_KEY,
    )
    print(
        f"{WORKER_SANDBOX_STORE_METADATA_KEY}="
        f"{','.join(worker_sandbox_ids)}"
    )
    print(f"{WEBHOOK_SANDBOX_METADATA_KEY}={env.metadata.get(WEBHOOK_SANDBOX_METADATA_KEY, '')}")
    webhook_sandbox_ids = sandbox_store(
        env.metadata,
        store_key=WEBHOOK_SANDBOX_STORE_METADATA_KEY,
        legacy_key=WEBHOOK_SANDBOX_METADATA_KEY,
    )
    print(
        f"{WEBHOOK_SANDBOX_STORE_METADATA_KEY}="
        f"{','.join(webhook_sandbox_ids)}"
    )


def create_agent_main() -> None:
    parser = argparse.ArgumentParser(description="Create a Claude Managed Agent.")
    parser.add_argument("name", help="Agent name")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    settings = load_settings()
    agent = create_agent(
        api_key=settings.require_anthropic_api_key(),
        name=args.name,
        model=args.model,
    )

    print(f"ANTHROPIC_AGENT_ID={agent.id}")
    print(f"created agent {agent.id} name={agent.name} version={agent.version}")


def build_template_main() -> None:
    parser = argparse.ArgumentParser(description="Build the E2B template for the worker.")
    parser.add_argument("--template-name", default=DEFAULT_TEMPLATE_NAME)
    args = parser.parse_args()

    load_settings()
    info = build_template(template_name=args.template_name)
    print(f"E2B_TEMPLATE_NAME={info.name}")


def start_worker_main() -> None:
    parser = argparse.ArgumentParser(description="Start an Anthropic worker inside E2B.")
    parser.add_argument("--sandbox-id", help="Reconnect to an existing worker sandbox")
    parser.add_argument("--template-name", default=DEFAULT_TEMPLATE_NAME)
    parser.add_argument("--timeout", type=int, default=DEFAULT_SANDBOX_TIMEOUT_SECONDS)
    parser.add_argument("--max-idle", type=_max_idle_arg, default=DEFAULT_WORKER_MAX_IDLE_SECONDS)
    parser.add_argument("--log-level", default=DEFAULT_LOG_LEVEL)
    args = parser.parse_args()

    sandbox = start_worker_sandbox(
        load_settings(),
        template_name=args.template_name,
        timeout_seconds=args.timeout,
        worker_max_idle_seconds=args.max_idle,
        log_level=args.log_level.upper(),
        sandbox_id=args.sandbox_id,
    )
    print(f"E2B_WORKER_SANDBOX_ID={sandbox.sandbox_id}")
    print(f"Worker log: {REMOTE_LOG}")


def start_webhook_server_main() -> None:
    parser = argparse.ArgumentParser(
        description="Start an auto-resumable E2B sandbox that receives Anthropic webhooks."
    )
    parser.add_argument("--sandbox-id", help="Reconnect to an existing webhook sandbox")
    parser.add_argument("--template-name", default=DEFAULT_TEMPLATE_NAME)
    parser.add_argument("--timeout", type=int, default=DEFAULT_SANDBOX_TIMEOUT_SECONDS)
    parser.add_argument("--max-idle", type=_max_idle_arg, default=DEFAULT_WORKER_MAX_IDLE_SECONDS)
    parser.add_argument("--log-level", default=DEFAULT_LOG_LEVEL)
    parser.add_argument("--port", type=int, default=DEFAULT_WEBHOOK_PORT)
    args = parser.parse_args()

    sandbox = start_webhook_server_sandbox(
        load_settings(),
        template_name=args.template_name,
        timeout_seconds=args.timeout,
        worker_max_idle_seconds=args.max_idle,
        log_level=args.log_level.upper(),
        port=args.port,
        sandbox_id=args.sandbox_id,
    )
    webhook_url = f"https://{sandbox.get_host(args.port)}/webhook"
    print(f"E2B_WEBHOOK_SANDBOX_ID={sandbox.sandbox_id}")
    print(f"Anthropic webhook URL: {webhook_url}")
    print("Subscribe this URL to session.status_run_started in the Anthropic Console.")
    print(f"Webhook log: {REMOTE_WEBHOOK_LOG}")
    print(f"Worker log: {REMOTE_LOG}")


def start_app_webhook_server_main() -> None:
    parser = argparse.ArgumentParser(
        description="Start an app-owned webhook server that routes work to an E2B worker sandbox."
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    load_settings()
    import uvicorn

    uvicorn.run(
        "anthropic_managed_agents_e2b.app_webhook_server:app",
        host=args.host,
        port=args.port,
    )


def stop_worker_main() -> None:
    parser = argparse.ArgumentParser(description="Stop an E2B Managed Agents worker sandbox.")
    parser.add_argument("sandbox_id")
    args = parser.parse_args()

    stop_worker_sandbox(load_settings(), args.sandbox_id)
    print(f"killed {args.sandbox_id}")


def send_message_main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a Managed Agents session and send a message."
    )
    parser.add_argument("message")
    args = parser.parse_args()

    settings = load_settings()
    for event in stream_message(
        api_key=settings.require_anthropic_api_key(),
        agent_id=settings.require_anthropic_agent_id(),
        environment_id=settings.require_anthropic_environment_id(),
        message=args.message,
    ):
        print(event, flush=True)


def upload_file_main() -> None:
    parser = argparse.ArgumentParser(description="Upload a local file into an E2B worker sandbox.")
    parser.add_argument("sandbox_id")
    parser.add_argument("file", type=Path)
    parser.add_argument("remote_path", nargs="?", default="/mnt/session/uploads/example-input.txt")
    args = parser.parse_args()

    load_settings()
    remote_path = upload_file_to_sandbox(
        sandbox_id=args.sandbox_id,
        local_path=args.file,
        remote_path=args.remote_path,
    )
    print(f"uploaded {args.file} to {remote_path}")
