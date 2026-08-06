# Flue Feedback Analyst on E2B (JavaScript)

A feedback analyst agent built on [Flue](https://flueframework.com) (v2), running
inside an [E2B](https://flueframework.com/docs/ecosystem/sandboxes/e2b/) Linux
sandbox. Ask it a product question in plain language; it writes Python, runs it
in the sandbox against a seeded feedback corpus, and hands back a published HTML
report with charts.

The seeded corpus in `data/` is **synthetic** — invented organizations, users,
and quotes written to look like a real product feedback export. It is fixture
data for the example, not E2B usage data, and none of its numbers describe a
real product.

This is the same agent as the sibling
[vercel-eve-feedback-analyst-js](../vercel-eve-feedback-analyst-js/), ported to
Flue. The agent data — `instructions.md`,
`skills/product-feedback-synthesizer.md`, `examples/sample-input.md` — is that
bundle's content verbatim, read at runtime from the project root.

## Run

```bash
pnpm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY and E2B_API_KEY
```

Both entry points load `.env` automatically — no manual exports.

There is one agent, and it always runs inside a real E2B sandbox. Both entry
points boot the same thing: sandbox created, corpus staged at `~/data/`,
pandas + matplotlib installed, then the agent works.

**REPL (the demo)** — interactive session: one sandbox for the whole
conversation, live tool-call log, paste prompts, get back a public report URL.
`exit` or Ctrl+C kills the sandbox:

```bash
pnpm dev
```

**One-shot** — one message in, the report URL out. The sandbox is left running
on success so the link stays clickable until its timeout lapses, and killed on
failure:

```bash
pnpm sample     # examples/sample-input.md
node --env-file=.env --experimental-transform-types scripts/synthesize-e2b.ts "…"  # ad hoc
```

Both scripts run under **Node**, never Bun — Flue's node runtime needs
`node:sqlite`, which Bun doesn't ship. `--experimental-transform-types` is
required on Node 22 because the blueprint adapter uses TypeScript parameter
properties; Node ≥ 23 runs TypeScript without the flag. `mise.toml` pins
Node 24.

## Layout

- `src/shared/source-data.ts` — loads the agent data from the project root:
  instructions verbatim, and the playbook wrapped with `defineSkill` (the
  upstream file's frontmatter lacks the Agent Skills `name` field, so a direct
  `SKILL.md` import won't validate).
- `src/shared/feedback-data.ts` — the corpus read in-process, one copy on disk
  (`data/` at the project root); the same bytes the entry scripts stage into
  the sandbox for `run_analysis`.
- `src/agents/product-feedback-synthesizer-e2b.ts` — the agent, as a factory;
  the caller supplies the sandbox. Mounts the tool suite and carries the
  E2B-mode addendum (the upstream `instructions.md` stays verbatim).
- `src/tools/` — the suite: `search_feedback`, `feedback_stats`,
  `query_product_analytics` in-process over the exports; `run_analysis`
  (Python in the sandbox) for what those cannot express; `draft_issue`
  (renders and stops, rejects invented ids); `publish_report`.
- `src/shared/stage-sandbox.ts` — shared boot: create, stage `~/data/`,
  install pandas + matplotlib.
- `src/sandboxes/e2b.ts` — the `flue add sandbox e2b` blueprint adapter,
  verbatim.
- `scripts/dev.ts` — REPL entry; `scripts/synthesize-e2b.ts` — one-shot entry.
- `src/repl/repl.ts` — terminal mechanics and the live tool-call log.
