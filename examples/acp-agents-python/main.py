import asyncio
import json
import os

import acp
from acp import schema
from dotenv import load_dotenv

from e2b import AsyncSandbox
from e2b_acp import AsyncACPAgent

load_dotenv()

# Each agent is a sandbox template plus the command that starts it in ACP mode.
AGENTS = {
    "opencode": {
        "template": "opencode",
        "command": "opencode acp",
        "envs": {
            "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY", ""),
            "OPENCODE_CONFIG_CONTENT": json.dumps({"model": "openai/gpt-5.6-luna"}),
        },
    },
    "goose": {
        "template": "goose",
        "command": "goose acp --with-builtin developer",
        "envs": {
            "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY", ""),
            "GOOSE_PROVIDER": "openai",
            "GOOSE_MODEL": "gpt-5.6-luna",
        },
    },
    "claude": {
        "template": "claude",
        "command": "claude-agent-acp",
        "envs": {"ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY", "")},
    },
}


class Client:
    """The ACP client: it shows the agent's progress and answers permission requests.

    File edits and shell commands happen inside the sandbox, not on this machine.
    """

    async def request_permission(self, session_id, tool_call, options, **kwargs):
        allow = next((o for o in options if o.kind == "allow_once"), options[0])
        print(f"\n[permission] {tool_call.title} -> {allow.name}")
        return schema.RequestPermissionResponse(
            outcome=schema.AllowedOutcome(outcome="selected", option_id=allow.option_id)
        )

    async def session_update(self, session_id, update, **kwargs):
        if (
            isinstance(update, schema.AgentMessageChunk)
            and update.content.type == "text"
        ):
            print(update.content.text, end="", flush=True)
        elif isinstance(update, schema.ToolCallStart):
            print(f"\n[tool] {update.title}")


async def main():
    name = os.getenv("AGENT", "opencode")
    if name not in AGENTS:
        raise SystemExit(f'Unknown AGENT "{name}", use one of: {", ".join(AGENTS)}')
    config = AGENTS[name]

    sandbox = await AsyncSandbox.create(config["template"], timeout=600)
    print(f"Sandbox {sandbox.sandbox_id} with {name}")
    try:
        cwd = "/home/user/project"
        await sandbox.files.make_dir(cwd)

        # Start the agent inside the sandbox and connect an ACP client to it.
        agent = await AsyncACPAgent.start(
            sandbox, config["command"], Client(), cwd=cwd, envs=config["envs"]
        )
        connection = agent.connection

        init = await connection.initialize(protocol_version=acp.PROTOCOL_VERSION)
        print(f"Connected to {init.agent_info.name} {init.agent_info.version}")

        session = await connection.new_session(cwd=cwd, mcp_servers=[])
        response = await connection.prompt(
            session_id=session.session_id,
            prompt=[
                acp.text_block(
                    "Create fizzbuzz.py that prints FizzBuzz for 1 to 15, "
                    "run it with python3 and show the output."
                )
            ],
        )
        print(f"\n\nTurn finished: {response.stop_reason}")

        # The agent worked inside the sandbox, so its result is there.
        result = await sandbox.commands.run(f"python3 {cwd}/fizzbuzz.py")
        print(f"fizzbuzz.py in the sandbox prints:\n{result.stdout}")
        if "FizzBuzz" not in result.stdout:
            raise RuntimeError("fizzbuzz.py did not print FizzBuzz")

        await agent.stop()
    finally:
        await sandbox.kill()


if __name__ == "__main__":
    asyncio.run(main())
