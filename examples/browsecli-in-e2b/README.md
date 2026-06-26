# Browser agent in an E2B sandbox

Run a small browser **agent** inside an [E2B](https://e2b.dev) sandbox. The agent
(built on the [Vercel AI SDK](https://sdk.vercel.ai)) has a single tool — the
Browserbase [`browse`](https://github.com/browserbase/stagehand/tree/main/packages/cli)
CLI — and uses it to drive a **remote Browserbase browser** over CDP.

The agent loop runs **in the sandbox**; the browser runs **on Browserbase**, so
no Chrome/Chromium is installed in the sandbox image.

```
┌───────────────────────────┐        CDP over wss         ┌───────────────────────────┐
│  E2B sandbox (Firecracker) │ ──────────────────────────▶ │  Browserbase browser       │
│  node + AI SDK agent loop  │                              │  (remote, headless)        │
│  tool: `browse` CLI        │ ◀──────────────────────────│                            │
└───────────────────────────┘        page data            └───────────────────────────┘
```

The default task is a deep-research example: pull the most recent 10-Q filing for
Snowflake, Datadog, and MongoDB from SEC EDGAR and return a comparison of their
quarterly revenue, growth, RPO, and top risk factor. The agent plans its own
steps — there are no site-specific instructions in the prompt. Override the goal
with the `TASK` env var.

## How it works

1. The driver (`index.ts`) creates a sandbox from the `browsecli-sandbox` template
   (Node + the `browse` CLI, no browser).
2. It uploads `agent.mjs` into the sandbox, installs the agent's deps
   (`ai`, `@ai-sdk/anthropic`, `zod`) there, and runs `node agent.mjs`.
3. The agent calls `browse open <url> --remote`, `browse get markdown body`,
   etc. Each call drives a remote Browserbase browser; the browser never runs in
   the sandbox.
4. The agent prints a `FINAL ANSWER` summarizing what it found.

## Files

| File | Purpose |
| --- | --- |
| `agent.mjs` | The agent (Vercel AI SDK `generateText`); its only tool shells out to `browse`. Runs **inside** the sandbox. |
| `index.ts` | Driver — `Sandbox.create({ template })`, uploads the agent, installs its deps, runs it, streams output. |
| `e2b.Dockerfile` | The template image: `node:20-slim` + `npm i -g browse`. **No Chrome.** |
| `e2b.toml` | E2B template config (`template_name`, `dockerfile`, `start_cmd`, resources). |
| `package.json` | Deps for the TS driver (`e2b`, `tsx`, `dotenv`). |
| `env.template` | `E2B_API_KEY`, `ANTHROPIC_API_KEY`, `BROWSERBASE_API_KEY`. |

## Setup

```bash
cp env.template .env   # fill in E2B_API_KEY, ANTHROPIC_API_KEY, BROWSERBASE_API_KEY
npm install
```

You need three keys:

- `E2B_API_KEY` — https://e2b.dev/docs/api-key
- `ANTHROPIC_API_KEY` — https://console.anthropic.com
- `BROWSERBASE_API_KEY` — https://www.browserbase.com (Settings)

## Build the template (one-time / on image change)

The driver creates sandboxes from a template built from `e2b.Dockerfile`.
Build it with the [E2B CLI](https://e2b.dev/docs/cli):

```bash
npm i -g @e2b/cli
e2b auth login
npm run build:template        # == e2b template build (reads e2b.toml)
```

## Run it

```bash
npm start                     # == tsx index.ts
```

Override the task:

```bash
TASK="Open example.com and summarize the page." npm start
```

Expected tail of output:

```
===== FINAL ANSWER =====
<the agent's synthesized, sourced answer>
```

## Notes

- The agent uses a plain remote browser (`browse open <url> --remote`), which
  works on **any Browserbase plan**.
- Verified browsers (residential IP + automatic CAPTCHA solving) are a Scale-plan
  upgrade. To use one, add `--verified` to the `browse open` calls in `agent.mjs`.
  See https://www.browserbase.com/pricing.
