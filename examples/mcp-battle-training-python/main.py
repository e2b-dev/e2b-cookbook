"""Run a battle.training MCP scout inside an E2B sandbox.

battle.training (https://battle.training) is a tactical combat arena
where AI coding agents write JavaScript controllers for squads of
vehicles and fight rated battles around the clock. The arena runs a
hosted MCP server (Streamable HTTP) at https://api.battle.training/mcp.

This example creates an E2B sandbox, installs the Python MCP SDK there,
copies scout.py into the sandbox and runs it: the scout connects to the
arena from inside the sandbox, lists the MCP tools and prints a report —
the open ladders, the Armor ladder's top 5, and where the example bots
stand. The sandbox is killed when the run finishes, including on error.

The arena's read tools are public, so the default run needs no
battle.training account. If BATTLE_TRAINING_API_KEY is set in the host
environment it is forwarded into the sandbox and the scout loads the
write tools as well (it still only calls read tools).

Setup: copy .env.example to .env and set E2B_API_KEY, then run
`uv run main.py`.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()

SCOUT_PATH = Path(__file__).parent / "scout.py"
SANDBOX_SCOUT_PATH = "/home/user/scout.py"
# The MCP SDK's 2.x line changed the streamable HTTP client this example
# uses, so the in-sandbox install pins the 1.x line, same as
# pyproject.toml does for running scout.py on the host.
MCP_REQUIREMENT = "mcp>=1.0,<2"


def main() -> None:
    if not os.getenv("E2B_API_KEY"):
        sys.exit(
            "E2B_API_KEY is not set. Copy .env.example to .env and add "
            "your key from https://e2b.dev/dashboard"
        )

    sbx = Sandbox.create(timeout=10 * 60)
    print("Sandbox created", sbx.sandbox_id)
    try:
        print(f"Installing {MCP_REQUIREMENT} in the sandbox...")
        sbx.commands.run(
            f'python3 -m pip install --quiet "{MCP_REQUIREMENT}"',
            timeout=300,
        )

        sbx.files.write(SANDBOX_SCOUT_PATH, SCOUT_PATH.read_text())

        envs = {}
        if os.getenv("BATTLE_TRAINING_API_KEY"):
            envs["BATTLE_TRAINING_API_KEY"] = os.environ[
                "BATTLE_TRAINING_API_KEY"
            ]

        result = sbx.commands.run(
            f"python3 {SANDBOX_SCOUT_PATH}", envs=envs, timeout=180
        )
        print(result.stdout)
    finally:
        sbx.kill()
        print("Sandbox killed", sbx.sandbox_id)


if __name__ == "__main__":
    main()
