# ACP coding agents in E2B Sandbox (TypeScript)

Run a coding agent that speaks the [Agent Client Protocol](https://agentclientprotocol.com) (ACP), such as OpenCode, goose or Claude Code, inside an E2B sandbox and drive it from your own code with the official ACP client.

One client works for every agent: only the sandbox template and the command that starts the agent change.

| `AGENT` | Template | Command | Key |
|---|---|---|---|
| `opencode` (default) | `opencode` | `opencode acp` | `OPENAI_API_KEY` |
| `goose` | `goose` | `goose acp --with-builtin developer` | `OPENAI_API_KEY` |
| `claude` | `claude` | `claude-agent-acp` | `ANTHROPIC_API_KEY` |

## How it works

`sandbox.acp.start(command)` starts the agent inside the sandbox and talks ACP over its stdin and stdout. `agent.stream` plugs straight into `ClientSideConnection` from `@agentclientprotocol/sdk`:

```ts
const agent = await sandbox.acp.start('opencode acp', { cwd, envs })
const connection = new ClientSideConnection(() => client, agent.stream)

await connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })
const { sessionId } = await connection.newSession({ cwd, mcpServers: [] })
await connection.prompt({ sessionId, prompt: [{ type: 'text', text: '...' }] })

await agent.close()
```

The agent's tools always run inside the sandbox. `sandbox.acp` turns off the client filesystem and terminal capabilities in `initialize` and rejects any agent request for them, so the agent never reads or writes files on the machine running your client.

Your client still answers permission requests and receives the agent's messages and tool calls. This example approves every permission request and prints the agent's progress.

## How to run

1. Copy `.env.template` to `.env` and fill in `E2B_API_KEY` and the key for the agent you use.
2. Install dependencies with `npm install`.
3. Run `npm start`, or pick another agent with `AGENT=goose npm start` or `AGENT=claude npm start`.

The agent writes and runs `fizzbuzz.py` in the sandbox, then the example runs the same file again to show that the result lives in the sandbox.
