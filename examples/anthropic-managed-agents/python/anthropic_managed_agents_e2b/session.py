from __future__ import annotations

import anthropic


def is_end_turn(event) -> bool:
    if getattr(event, "type", None) != "session.status_idle":
        return False
    return getattr(getattr(event, "stop_reason", None), "type", None) == "end_turn"


def stream_message(
    *,
    api_key: str,
    agent_id: str,
    environment_id: str,
    message: str,
):
    client = anthropic.Anthropic(api_key=api_key)
    session = client.beta.sessions.create(
        agent=agent_id,
        environment_id=environment_id,
    )
    print(f"session={session.id}", flush=True)

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
            yield event
            if is_end_turn(event):
                break
