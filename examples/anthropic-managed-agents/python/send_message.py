from __future__ import annotations

import argparse

import anthropic

from config import ANTHROPIC_AGENT_ID, ANTHROPIC_API_KEY, ANTHROPIC_ENVIRONMENT_ID, require_env


def is_end_turn(event) -> bool:
    if getattr(event, "type", None) != "session.status_idle":
        return False
    return getattr(getattr(event, "stop_reason", None), "type", None) == "end_turn"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a Managed Agents session and send a message."
    )
    parser.add_argument("message")
    args = parser.parse_args()

    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is required")
    if not ANTHROPIC_AGENT_ID:
        raise RuntimeError("ANTHROPIC_AGENT_ID is required")
    require_env("ANTHROPIC_ENVIRONMENT_ID")

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    session = client.beta.sessions.create(
        agent=ANTHROPIC_AGENT_ID,
        environment_id=ANTHROPIC_ENVIRONMENT_ID,
    )
    print(f"session={session.id}", flush=True)

    with client.beta.sessions.events.stream(session.id) as stream:
        client.beta.sessions.events.send(
            session.id,
            events=[
                {
                    "type": "user.message",
                    "content": [{"type": "text", "text": args.message}],
                }
            ],
        )
        for event in stream:
            print(event, flush=True)
            if is_end_turn(event):
                break


if __name__ == "__main__":
    main()
