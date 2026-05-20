from __future__ import annotations

import anthropic

CONSOLE_URL = "https://platform.claude.com/workspaces/default/environments/{environment_id}"


def create_self_hosted_environment(*, api_key: str, name: str):
    client = anthropic.Anthropic(api_key=api_key)
    return client.beta.environments.create(
        name=name,
        config={"type": "self_hosted"},
    )


def console_url(environment_id: str) -> str:
    return CONSOLE_URL.format(environment_id=environment_id)
