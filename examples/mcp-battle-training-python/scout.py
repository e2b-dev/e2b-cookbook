"""Scout the battle.training arena through its hosted MCP server.

This is the program that runs inside the E2B sandbox (main.py writes it
there), but it works anywhere with internet access:

    uv run scout.py

It connects to https://api.battle.training/mcp (Streamable HTTP), lists
the tools, and prints a scouting report: the open ladders, the Armor
ladder's top 5, and the standings of the example bots.

The server's read tools are public. If BATTLE_TRAINING_API_KEY is set in
the environment it is sent as a bearer header and the write tools
(create_bot, upload_version, enrol_ladder, scrimmage, ...) load too;
this script only ever calls read tools.
"""

import asyncio
import json
import os
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

MCP_URL = "https://api.battle.training/mcp"

# The sample operator's own bots. Anyone can substitute any public bot
# names here.
EXAMPLE_BOTS = ["delynn-prime", "delynn-pyong"]


def _payload(result: Any) -> dict[str, Any]:
    """Parse the JSON payload out of an MCP tool result."""
    for block in result.content or []:
        text = getattr(block, "text", None)
        if text:
            return json.loads(text)
    raise ValueError(f"MCP tool returned no JSON content: {result!r:.200}")


async def scout() -> None:
    api_key = os.environ.get("BATTLE_TRAINING_API_KEY")
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else None

    async with streamablehttp_client(MCP_URL, headers=headers) as (read, write, _):
        async with ClientSession(read, write) as session:
            server = await session.initialize()
            tools = await session.list_tools()
            mode = "read + write" if api_key else "read-only"
            print(
                f"Connected to {server.serverInfo.name} "
                f"{server.serverInfo.version}"
            )
            print(f"Loaded {len(tools.tools)} battle.training tools ({mode})\n")

            ladders = _payload(await session.call_tool("list_ladders", {}))
            open_ladders = [
                f"{ladder['slug']} ({ladder['enrolled']} bots)"
                for ladder in ladders["ladders"]
                if ladder["status"] == "open"
            ]
            print("Open ladders:", ", ".join(open_ladders))

            ladder = _payload(await session.call_tool("get_ladder", {}))
            entries = ladder["entries"]
            print(f"\nArmor ladder: {len(entries)} bots, top 5:")
            for entry in entries[:5]:
                print(
                    f"  #{entry['rank']} {entry['bot']} "
                    f"(rating {entry['rating']}, by {entry['agent']})"
                )

            for bot_name in EXAMPLE_BOTS:
                bot = _payload(
                    await session.call_tool("get_bot", {"name": bot_name})
                )
                for theater, standing in bot["theaters"].items():
                    print(
                        f"\n{bot_name} [{theater}]: rank {standing['rank']}/"
                        f"{standing['of']}, rating {standing['rating']} "
                        f"(RD {standing['rd']}), "
                        f"{standing['wins']}W-{standing['losses']}L-{standing['draws']}D"
                    )


if __name__ == "__main__":
    asyncio.run(scout())
