from __future__ import annotations

import argparse

import anthropic

from config import ANTHROPIC_API_KEY

SANDBOX_TOOLS = ["bash", "read", "write", "edit", "glob", "grep"]
WEB_TOOLS = ["web_fetch", "web_search"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a Claude Managed Agent.")
    parser.add_argument("name", help="Agent name")
    parser.add_argument("--model", default="claude-sonnet-4-6")
    args = parser.parse_args()

    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is required")

    agent = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY).beta.agents.create(
        name=args.name,
        model=args.model,
        system="You have a Linux sandbox. Use the available tools to complete the task.",
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
                    for tool in SANDBOX_TOOLS + WEB_TOOLS
                ],
            }
        ],
    )

    print(f"ANTHROPIC_AGENT_ID={agent.id}")
    print(f"created agent {agent.id} name={agent.name} version={agent.version}")


if __name__ == "__main__":
    main()

