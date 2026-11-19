# OpenHands in E2B Sandbox (TypeScript)

This example runs an [OpenHands](https://github.com/OpenHands/OpenHands) agent in an E2B sandbox. It creates a sandbox from the pre-built `openhands` template, writes a small Python project with a failing test, and starts the OpenHands Agent Server with `agent-canvas --backend-only`. It then uses the [OpenHands TypeScript client](https://www.npmjs.com/package/@openhands/typescript-client) to ask the agent to fix the bug, and prints the `git diff` and reruns the test.

The agent and its terminal and file tools run inside the sandbox. Your script sends the task and waits for the agent over the sandbox URL. The model API key goes into the sandbox with the agent spec, because the agent calls the model from there; your E2B API key stays on your machine. The script protects the Agent Server with a random API key that it never prints.

The OpenHands TypeScript client is marked as alpha software, so its API may change between versions.

See the [OpenHands guide](https://e2b.dev/docs/agents/openhands) for running the Agent Canvas UI in a sandbox and keeping it alive across timeouts.

## Configure API keys

Set these in `.env` (see `.env.example`):

- `E2B_API_KEY` from the [E2B dashboard](https://e2b.dev/dashboard).
- `LLM_API_KEY`: your model provider's key. Without it, the example uses `OPENAI_API_KEY`.
- `LLM_MODEL` (optional): any model [LiteLLM](https://docs.litellm.ai/docs/providers) supports, with its provider prefix. Defaults to `openai/gpt-5.6-luna`.

## Setup and run

Requires Node.js 22.19 or newer.

```bash
cp .env.example .env   # then fill in the keys
npm install
npm start
```

The script prints the agent's final message, the diff of `calc.py`, and `Test passes after the fix.`, then kills the sandbox. A run creates one sandbox for up to 15 minutes and makes billable model calls.
