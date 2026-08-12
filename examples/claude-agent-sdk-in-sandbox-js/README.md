# Claude Agent SDK in E2B Sandbox (TypeScript)

This example shows how to run an agent built with Anthropic's [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk) inside an E2B Sandbox.

It complements the [Claude Code in Sandbox](../anthropic-claude-code-in-sandbox-js) example: instead of piping a prompt into the `claude` CLI and getting a single stdout blob back, the Agent SDK gives you **structured messages**. Every tool call, text block, and the final result (including cost and turn count) streams back to your host process as JSON, so you can build real product UX on top of it.

## Why run the Agent SDK in a sandbox?

- **Safe full autonomy.** The agent runs with `permissionMode: "bypassPermissions"`: no permission prompts, and no `--dangerously-skip-permissions` on your own machine. The E2B Sandbox is the security boundary, so everything the agent reads, writes, or executes stays isolated.
- **Structured streaming.** The host receives typed messages (`system`, `assistant`, `result`) instead of raw text, so you can render progress, count tokens, and track cost.
- **Artifact retrieval.** When the agent finishes, the host downloads everything it produced in `/agent/workspace` via the E2B Files API.

## How it works

1. `src/template.ts` defines a sandbox template with Node.js 24 and `@anthropic-ai/claude-agent-sdk` pre-installed (the SDK bundles the Claude Code runtime).
2. `src/agent.mjs` is the script that runs *inside* the sandbox: it calls `query()` from the Agent SDK and prints each message as a JSON line.
3. `src/index.ts` runs on your machine: it creates the sandbox, uploads the agent script, streams and pretty-prints the agent's messages, and downloads the produced files to `./output`.

The demo prompt asks the agent to build a self-contained `index.html` that trains a tiny neural network on XOR and animates its decision boundary. Open `./output/index.html` in a browser when it's done.

## How to run

**1. Copy `.env.template` to `.env` and fill in your keys** (`E2B_API_KEY`, `ANTHROPIC_API_KEY`).

If you have a Claude Pro/Max subscription instead of an API key, run `claude setup-token` and set `CLAUDE_CODE_OAUTH_TOKEN` in `.env` instead of `ANTHROPIC_API_KEY`.

**2. Install dependencies**

```bash
npm install
```

**3. Build the sandbox template** (once)

```bash
npm run e2b:build:prod
```

**4. Run the example**

```bash
npm run start
```

You'll see the agent's tool calls and messages stream in, followed by a cost/turn summary and the downloaded files:

```
Sandbox created ia57h1gnsoxaxtmu2pwb8
Agent started (model: claude-sonnet-5)
> Bash {"command":"pwd","description":"Show current working directory"}
> Write {"file_path":"/agent/workspace/index.html","content":"<!DOCTYPE html>…
Created /agent/workspace/index.html (243 lines, single self-contained file)…

Agent finished: success (4 turns, $0.1316, 33.3s)
Downloaded /agent/workspace/index.html -> output/index.html
```

## Customizing

- Change `PROMPT` in `src/index.ts` to give the agent a different task.
- Tighten `allowedTools` in `src/agent.mjs` if the agent shouldn't touch the network (`WebFetch`) or shell (`Bash`).
- Pass `model` in the `query()` options to pin a specific Claude model.
