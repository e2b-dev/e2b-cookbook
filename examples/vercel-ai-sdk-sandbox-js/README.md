# Vercel AI SDK on E2B Sandboxes (JavaScript)

Two ways to run [AI SDK](https://ai-sdk.dev) agents on E2B, both through
[`@e2b/ai-sdk-sandbox`](https://www.npmjs.com/package/@e2b/ai-sdk-sandbox) —
the E2B provider for AI SDK 7's sandbox interface.

## 1. A sandboxed tool (`src/tool.ts`)

A regular `generateText` agent with a `bash` tool whose commands run in an
isolated E2B sandbox instead of your machine. `session.restricted()` is the
security boundary: the tool gets file I/O and command execution, but nothing
that could stop the sandbox or change its network policy.

```ts
const session = await createE2BSandbox({}).createSession()
const sandbox = session.restricted()

const result = await generateText({
  model,
  tools: {
    bash: tool({
      inputSchema: z.object({ command: z.string() }),
      execute: async ({ command }) => sandbox.run({ command }),
    }),
  },
  prompt: '…',
})
```

## 2. A coding agent on the sandbox (`src/harness.ts`)

The [AI SDK harness](https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/overview)
runs the [Pi](https://github.com/earendil-works/pi) coding agent against the
E2B sandbox: Pi runs as an in-process library, and every tool it uses —
`bash`, `read`, `write`, `grep` — executes inside the sandbox, never on your
machine.

```ts
const agent = new HarnessAgent({
  harness: createPi({ auth: 'openai', model: 'openai/gpt-5.6-luna' }),
  sandbox: createE2BSandbox({ timeoutMs: 10 * 60 * 1000 }),
})
```

Other harness adapters (`@ai-sdk/harness-claude-code`,
`@ai-sdk/harness-codex`) plug into the same `sandbox` option.

## How to run

**1. Set the API keys**

Copy `.env.example` to `.env` and fill in `E2B_API_KEY` plus an LLM provider
key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — the scripts pick whichever is
set, for both the model and the harness adapter).

**2. Install dependencies**

```bash
npm install
```

**3. Run**

```bash
npm run start           # sandboxed tool
npm run start:harness   # coding agent inside the sandbox
```

Both destroy their sandboxes at the end.
