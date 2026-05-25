from __future__ import annotations

import json

import anthropic

CONSOLE_URL = "https://platform.claude.com/workspaces/default/environments/{environment_id}"
WORKER_SANDBOX_METADATA_KEY = "e2b_worker_sandbox_id"
WEBHOOK_SANDBOX_METADATA_KEY = "e2b_webhook_sandbox_id"
WORKER_SANDBOX_STORE_METADATA_KEY = "e2b_worker_sandbox_ids"
WEBHOOK_SANDBOX_STORE_METADATA_KEY = "e2b_webhook_sandbox_ids"


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


def sandbox_store(metadata: dict[str, str], *, store_key: str, legacy_key: str) -> list[str]:
    ids: list[str] = []
    raw = metadata.get(store_key)
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = []
        if isinstance(parsed, list):
            ids.extend(item for item in parsed if isinstance(item, str) and item)

    legacy_id = metadata.get(legacy_key)
    if legacy_id:
        ids.append(legacy_id)

    return list(dict.fromkeys(ids))


def serialize_sandbox_store(sandbox_ids: list[str]) -> str:
    return json.dumps(list(dict.fromkeys(sandbox_ids)), separators=(",", ":"))


def add_sandbox_to_metadata_store(
    *,
    api_key: str,
    environment_id: str,
    store_key: str,
    legacy_key: str,
    sandbox_id: str,
):
    env = retrieve_environment(api_key=api_key, environment_id=environment_id)
    sandbox_ids = sandbox_store(env.metadata, store_key=store_key, legacy_key=legacy_key)
    sandbox_ids = [sandbox_id, *(item for item in sandbox_ids if item != sandbox_id)]
    return update_environment_metadata(
        api_key=api_key,
        environment_id=environment_id,
        metadata={
            legacy_key: sandbox_id,
            store_key: serialize_sandbox_store(sandbox_ids),
        },
    )


def clear_matching_sandbox_metadata(
    *,
    api_key: str,
    environment_id: str,
    sandbox_id: str,
):
    env = retrieve_environment(api_key=api_key, environment_id=environment_id)
    metadata: dict[str, str | None] = {}
    for legacy_key, store_key in (
        (WORKER_SANDBOX_METADATA_KEY, WORKER_SANDBOX_STORE_METADATA_KEY),
        (WEBHOOK_SANDBOX_METADATA_KEY, WEBHOOK_SANDBOX_STORE_METADATA_KEY),
    ):
        if env.metadata.get(legacy_key) == sandbox_id:
            metadata[legacy_key] = None
        sandbox_ids = sandbox_store(env.metadata, store_key=store_key, legacy_key=legacy_key)
        updated_ids = [item for item in sandbox_ids if item != sandbox_id]
        if updated_ids != sandbox_ids:
            metadata[store_key] = serialize_sandbox_store(updated_ids)
    if not metadata:
        return env
    return update_environment_metadata(
        api_key=api_key,
        environment_id=environment_id,
        metadata=metadata,
    )


def console_url(environment_id: str) -> str:
    return CONSOLE_URL.format(environment_id=environment_id)
