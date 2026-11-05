# ACP coding agents in E2B Sandbox (TypeScript)

Run a coding agent that speaks the [Agent Client Protocol](https://agentclientprotocol.com) (ACP), such as OpenCode, goose or Claude Code, inside an E2B sandbox and drive it from your own code with the official ACP client.

The same client works for all three agents: only the sandbox template and the command that starts the agent change.

| `AGENT` | Template | Command | Key |
|---|---|---|---|
| `opencode` (default) | `opencode` | `opencode acp` | `OPENAI_API_KEY` |
| `goose` | `goose` | `goose acp --with-builtin developer` | `OPENAI_API_KEY` |
| `claude` | `claude` | `claude-agent-acp` | `ANTHROPIC_API_KEY` |

## How it works

The example creates a sandbox from the agent's template, then `ACPAgent.start()` from [`@e2b/acp`](https://www.npmjs.com/package/@e2b/acp) starts the agent inside it and connects your ACP client, built with `client()` from `@agentclientprotocol/sdk`, over the agent's stdin and stdout:

```ts
const agent = await ACPAgent.start(sandbox, 'opencode acp', app, { cwd, envs })

const acp = agent.connection.agent
await acp.request(methods.agent.initialize, { protocolVersion: PROTOCOL_VERSION })
const { sessionId } = await acp.request(methods.agent.session.new, { cwd, mcpServers: [] })
await acp.request(methods.agent.session.prompt, { sessionId, prompt: [{ type: 'text', text: '...' }] })

await agent.stop()
```

`ACPAgent.start()` turns off the client filesystem and terminal capabilities in `initialize` and rejects agent requests for them, so the agent edits files and runs commands with its own tools inside the sandbox, never on the machine running your client. It does not restrict the agent's network access or the MCP servers you pass to it.

Your client still answers permission requests and receives the agent's messages and tool calls. This example approves each request with its `allow_once` option and prints the agent's progress.

## How to run

1. Copy `.env.template` to `.env` and fill in `E2B_API_KEY` and the key for the agent you use.
2. Install dependencies with `npm install`.
3. Run `npm start`, or pick another agent with `AGENT=goose npm start` or `AGENT=claude npm start`.

The agent writes and runs `fizzbuzz.py` in the sandbox, then the example runs the same file again and checks that it prints `FizzBuzz`, which shows the result lives in the sandbox.
