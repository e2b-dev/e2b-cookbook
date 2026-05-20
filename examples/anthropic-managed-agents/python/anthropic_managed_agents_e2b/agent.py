from __future__ import annotations

from collections.abc import Sequence

import anthropic

SANDBOX_TOOLS = ("bash", "read", "write", "edit", "glob", "grep")
WEB_TOOLS = ("web_fetch", "web_search")
DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_SYSTEM_PROMPT = "You have a Linux sandbox. Use the available tools to complete the task."


def create_agent(
    *,
    api_key: str,
    name: str,
    model: str = DEFAULT_MODEL,
    sandbox_tools: Sequence[str] = SANDBOX_TOOLS,
    web_tools: Sequence[str] = WEB_TOOLS,
):
    client = anthropic.Anthropic(api_key=api_key)
    return client.beta.agents.create(
        name=name,
        model=model,
        system=DEFAULT_SYSTEM_PROMPT,
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
                    for tool in (*sandbox_tools, *web_tools)
                ],
            }
        ],
    )
