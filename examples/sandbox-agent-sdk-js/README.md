# Sandbox Agent SDK in E2B Sandbox (JavaScript)

Run [Sandbox Agent](https://github.com/rivet-dev/sandbox-agent) inside E2B, then control it with the [Sandbox Agent SDK](https://sandboxagent.dev/docs/sdk-overview) (npm: [`sandbox-agent`](https://www.npmjs.com/package/sandbox-agent)).

## Why use Sandbox Agent SDK

Running coding agents remotely is hard: local-first SDK assumptions, SSH streaming/TTY issues, and agent-specific APIs.

Sandbox Agent gives you a simple way to launch coding agents inside sandboxes and manage them over HTTP directly from your backend.

- **Single API, Multiple Agents** — Drive Claude Code, Codex, OpenCode, Cursor, Amp, and Pi from one unified interface with complete feature support — no need to build separate integrations for each.
- **Standardized Event Schema** — Every agent outputs events in its own format. The universal session schema brings them all into a single, normalized structure that's easy to persist and replay.
- **Two Ways to Deploy** — Use it as a self-contained HTTP server, or drop in the TypeScript SDK to embed it right inside your application.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env`:

```bash
E2B_API_KEY=your_e2b_api_key

# At least one provider key
OPENAI_API_KEY=your_openai_api_key
# ANTHROPIC_API_KEY=your_anthropic_api_key
```

Provider credential options for other agents: [Sandbox Agent credentials docs](https://sandboxagent.dev/docs/llm-credentials).

3. Run:

```bash
npm run start
```

This starts up your Sandbox Agent and connects it to your E2B Sandbox. To run one prompt and stream events, uncomment the block in `src/index.ts`.

## References

- [Sandbox Agent SDK docs](https://sandboxagent.dev/docs/sdk-overview)
- [Sandbox Agent sessions and events](https://sandboxagent.dev/docs/agent-sessions).
- [Sandbox Agent session persistence](https://sandboxagent.dev/docs/session-persistence)
- [Sandbox Agent credentials](https://sandboxagent.dev/docs/credentials)
- [E2B Sandbox Agent SDK guide](https://e2b.dev/docs/agents/sandbox-agent-sdk)
