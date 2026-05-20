from __future__ import annotations

from anthropic_managed_agents_e2b.cli import send_message_main as main
from anthropic_managed_agents_e2b.session import is_end_turn

__all__ = ["is_end_turn", "main"]


if __name__ == "__main__":
    main()
