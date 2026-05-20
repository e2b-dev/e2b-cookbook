from __future__ import annotations

import anthropic

CONSOLE_URL = "https://platform.claude.com/workspaces/default/environments/{environment_id}"
WORKER_SANDBOX_METADATA_KEY = "e2b_worker_sandbox_id"
WEBHOOK_SANDBOX_METADATA_KEY = "e2b_webhook_sandbox_id"


def create_self_hosted_environment(*, api_key: str, name: str):
    client = anthropic.Anthropic(api_key=api_key)
    return client.beta.environments.create(
        name=name,
        config={"type": "self_hosted"},
    )


def retrieve_environment(*, api_key: str, environment_id: str):
    client = anthropic.Anthropic(api_key=api_key)
    return client.beta.environments.retrieve(environment_id)


def update_environment_metadata(
    *,
    api_key: str,
    environment_id: str,
    metadata: dict[str, str | None],
):
    client = anthropic.Anthropic(api_key=api_key)
    return client.beta.environments.update(
        environment_id,
        metadata=metadata,
    )


def clear_matching_sandbox_metadata(
    *,
    api_key: str,
    environment_id: str,
    sandbox_id: str,
):
    env = retrieve_environment(api_key=api_key, environment_id=environment_id)
    metadata: dict[str, str | None] = {}
    for key in (WORKER_SANDBOX_METADATA_KEY, WEBHOOK_SANDBOX_METADATA_KEY):
        if env.metadata.get(key) == sandbox_id:
            metadata[key] = None
    if not metadata:
        return env
    return update_environment_metadata(
        api_key=api_key,
        environment_id=environment_id,
        metadata=metadata,
    )


def console_url(environment_id: str) -> str:
    return CONSOLE_URL.format(environment_id=environment_id)
