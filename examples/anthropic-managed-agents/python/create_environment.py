from __future__ import annotations

import argparse

import anthropic

from config import ANTHROPIC_API_KEY

CONSOLE_URL = "https://platform.claude.com/workspaces/default/environments/{environment_id}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an Anthropic self-hosted environment.")
    parser.add_argument("name", help="Environment name")
    args = parser.parse_args()

    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is required")

    env = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY).beta.environments.create(
        name=args.name,
        config={"type": "self_hosted"},
    )

    print(f"ANTHROPIC_ENVIRONMENT_ID={env.id}")
    print(f"Claude Console: {CONSOLE_URL.format(environment_id=env.id)}")
    print("Open the Console URL and generate ANTHROPIC_ENVIRONMENT_KEY.")


if __name__ == "__main__":
    main()

