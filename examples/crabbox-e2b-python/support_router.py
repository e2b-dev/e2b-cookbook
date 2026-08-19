"""Route support tickets into standard or priority review queues."""

from __future__ import annotations

from collections.abc import Mapping


def route_ticket(ticket: Mapping[str, object]) -> str:
    """Return the queue for one support ticket."""
    severity = str(ticket.get("severity", "")).casefold()
    account_tier = str(ticket.get("account_tier", "")).casefold()

    try:
        affected_users = int(ticket.get("affected_users", 0))
    except (TypeError, ValueError) as error:
        raise ValueError("affected_users must be an integer") from error

    if severity in {"critical", "security"}:
        return "priority"

    if account_tier == "enterprise" and affected_users >= 20:
        return "priority"

    return "standard"
