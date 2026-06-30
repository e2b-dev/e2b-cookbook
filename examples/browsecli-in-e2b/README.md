# Browser agent in an E2B sandbox

A deep-research **agent** (built on the [Vercel AI SDK](https://sdk.vercel.ai)) whose
only tool runs commands inside an [E2B](https://e2b.dev) sandbox. The sandbox has the
Browserbase [`browse`](https://github.com/browserbase/stagehand/tree/main/packages/cli)
CLI installed, so the agent does its research by running `browse` commands there.
`browse` drives a **remote Browserbase browser** over CDP — no Chrome runs in the
sandbox itself.

The agent loop runs on the **host**; its `bash` tool executes inside the **sandbox**;
the browser runs on **Browserbase**:

```
┌────────────────────────┐   bash   ┌────────────────────────┐   CDP/wss   ┌────────────────────────┐
│  host (index.ts)       │ ───────▶ │  E2B sandbox           │ ──────────▶ │  Browserbase browser   │
│  AI SDK agent loop     │          │  `browse` CLI          │             │  (remote, headless)    │
│  tool: bash → sandbox  │ ◀─────── │  commands.run(cmd)     │ ◀────────── │                        │
└────────────────────────┘  output  └────────────────────────┘  page data  └────────────────────────┘
```

This is the idiomatic "sandbox as a tool" shape: the agent reasons on the host, and
the sandbox is the isolated place where its commands actually run.

The default task is a product-research example: search Amazon for the top mechanical
keyboards and return a comparison of the top 5 results — each product's title, price,
star rating, number of ratings, and its product URL. It's a deliberately browser-only
task: Amazon search returns no products to a plain `curl`, so the agent has to drive a
real browser to get the data. The agent plans its own steps — there are no site-specific
instructions in the prompt. Override the goal with the `TASK` env var.

## How it works

1. `index.ts` (on your machine) creates a sandbox from the `browsecli-sandbox`
   template (Node + the `browse` CLI, no browser) and injects two env vars into the
   sandbox: `BROWSERBASE_API_KEY` (so `browse` can authenticate) and
   `BROWSE_SESSION=agent` (so every `browse` call runs remotely and shares one
   browser session — no `--remote`/`--session` flags needed).
2. It runs an AI SDK agent loop on the host. The agent's single `bash` tool sends
   each command to the sandbox via `sandbox.commands.run(command)`.
3. The agent has a minimal system prompt: it learns the CLI on its own by running
   `browse --help`, then drives the remote Browserbase browser with plain commands
   like `browse open '<url>'` and `browse get markdown body`. Thanks to the env vars,
   those calls run remotely and persist across steps with no extra flags; the browser
   never runs in the sandbox.
4. The agent prints a `FINAL ANSWER` summarizing what it found.

## Files

| File | Purpose |
| --- | --- |
| `index.ts` | The whole example: creates the sandbox, runs the AI SDK agent loop on the host, and exposes a `bash` tool that execs inside the sandbox via `sandbox.commands.run`. |
| `e2b.Dockerfile` | The template image: `node:20-slim` + `npm i -g browse`. **No Chrome.** |
| `e2b.toml` | E2B template config (`template_name`, `dockerfile`, `start_cmd`, resources). |
| `package.json` | Deps (`e2b`, `ai`, `@ai-sdk/anthropic`, `zod`, `tsx`, `dotenv`). |
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

The example creates sandboxes from a template built from `e2b.Dockerfile`.
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

- The agent uses a plain remote browser, which works on **any Browserbase plan**.
- `BROWSE_SESSION=agent` in the sandbox env makes every `browse` call run remotely
  and share a single session, so the agent never needs `--remote` or `--session`.
- Verified browsers (residential IP + automatic CAPTCHA solving) are a Scale-plan
  upgrade. See https://www.browserbase.com/pricing.
- `BROWSERBASE_API_KEY` is passed to the sandbox via the SDK's `envs` option, so it
  only ever lives in the sandbox's environment — never written to a committed file.
