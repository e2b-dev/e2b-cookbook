# ACP coding agents in E2B Sandbox (Python)

Run a coding agent that speaks the [Agent Client Protocol](https://agentclientprotocol.com) (ACP), such as OpenCode, goose or Claude Code, inside an E2B sandbox and drive it from your own code with the official ACP client (`agent-client-protocol`).

One client works for every agent: only the sandbox template and the command that starts the agent change.

| `AGENT` | Template | Command | Key |
|---|---|---|---|
| `opencode` (default) | `opencode` | `opencode acp` | `OPENAI_API_KEY` |
| `goose` | `goose` | `goose acp --with-builtin developer` | `OPENAI_API_KEY` |
| `claude` | `claude` | `claude-agent-acp` | `ANTHROPIC_API_KEY` |

## How it works

`sandbox.acp.start(command)` starts the agent inside the sandbox and talks ACP over its stdin and stdout. The returned agent is an ACP transport, so it goes straight into `acp.connect_to_agent()`:

```python
agent = await sandbox.acp.start("opencode acp", cwd=cwd, envs=envs)
connection = acp.connect_to_agent(client, agent)

await connection.initialize(protocol_version=acp.PROTOCOL_VERSION)
session = await connection.new_session(cwd=cwd, mcp_servers=[])
await connection.prompt(session_id=session.session_id, prompt=[acp.text_block("...")])

await agent.close()
```

The agent's tools always run inside the sandbox. `sandbox.acp` turns off the client filesystem and terminal capabilities in `initialize` and rejects any agent request for them, so the agent never reads or writes files on the machine running your client.

Your client still answers permission requests and receives the agent's messages and tool calls. This example approves every permission request and prints the agent's progress.

The ACP Python SDK is asynchronous, so the example uses `AsyncSandbox`.

## How to run

1. Copy `.env.template` to `.env` and fill in `E2B_API_KEY` and the key for the agent you use.
2. Run `uv run main.py`, or pick another agent with `AGENT=goose uv run main.py` or `AGENT=claude uv run main.py`.

The agent writes and runs `fizzbuzz.py` in the sandbox, then the example runs the same file again to show that the result lives in the sandbox.
