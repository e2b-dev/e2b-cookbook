# Pi builds its own E2B code interpreter (JavaScript)

This example shows [Pi](https://github.com/earendil-works/pi) — a minimal
terminal coding agent whose signature feature is writing its own TypeScript
extensions — running in an E2B sandbox and extending **itself** with an E2B
code-interpreter tool.

![demo](demo.gif)

**Act 1** — Pi, running in an E2B sandbox (the `pi` template), is handed
[`EXTENSION_SPEC.md`](EXTENSION_SPEC.md) and writes its own extension: a
`run_python` tool backed by
[`@e2b/code-interpreter`](https://www.npmjs.com/package/@e2b/code-interpreter).

**Act 2** — Pi uses the tool it just built. The extension spins up a second
E2B sandbox with a stateful Jupyter kernel; Pi loads the dataset, iterates,
and produces a chart that the script downloads to your machine.

Letting an agent write and hot-load code that runs with full permissions is
exactly the workload you don't run on your laptop — the sandbox is what
makes Act 1 sane. And the script never hopes Act 1 worked: it sanity-checks
the file Pi wrote and falls back to the reference implementation in
[`extension/e2b-code-interpreter.ts`](extension/e2b-code-interpreter.ts) if
needed. Act 2 runs either way.

## How it works

There are two E2B sandboxes; your machine only orchestrates:

```
this script ──creates──▶ Sandbox A ('pi' template)      Sandbox B (code-interpreter)
                         • Pi runs headless here        • created BY the extension
                         • the extension Pi wrote       • stateful Jupyter kernel
                         • data/sales.csv               • pandas, matplotlib
```

1. Pi loads the extension at startup; `pi.registerTool({ name: "run_python", … })`
   puts the tool into the model's system prompt.
2. Instead of guessing at the CSV, the model emits `run_python` calls whose
   argument is Python code.
3. The extension executes each call with `sandbox.runCode(code)` in Sandbox B —
   a notebook cell in the cloud. The kernel stays alive between calls, so
   dataframes and variables persist while the agent iterates.
4. `plt.show()` makes the kernel return figures as base64 PNGs; the extension
   saves them and reports the paths back to the model.
5. `/quit` fires `session_shutdown` and the extension kills Sandbox B.

## How to run the example

**1. Set the API keys**

Copy `.env.example` to `.env` and fill in `E2B_API_KEY` plus an LLM
provider key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`).

**2. Install dependencies**

```bash
npm install
```

**3. Run the script**

```bash
npm run start
```

Both acts stream Pi's output to your terminal; charts land in `./output/`.
The sandboxes are killed at the end.

## Interactive variant

Everything also works in Pi's normal TUI. Create a sandbox and connect:

```bash
e2b sandbox create pi
```

Then inside, run `pi`, ask it to build the extension from the spec, `/reload`,
and use `run_python` interactively — that's what the recording above shows.

## A note on credentials

The extension creates Sandbox B from *inside* Sandbox A, so `E2B_API_KEY` is
forwarded into the agent's sandbox by design — and E2B API keys are
team-scoped, not permission-scoped. Use a dedicated E2B team for
agent-launched workloads so the blast radius is that team's sandboxes and
bill, and treat both keys as disposable. The keys are passed as runtime
`envs` (never baked into a template); don't pause or snapshot the sandbox if
you don't want them persisted.

## Files

- `src/index.ts` — the orchestrator (create sandbox → stage spec + data →
  Act 1 → verify/fall back → Act 2 → download charts → kill).
- `EXTENSION_SPEC.md` — the spec handed to Pi, including a complete inline
  API reference so the agent needs nothing else.
- `extension/e2b-code-interpreter.ts` — the reference implementation.
- `data/sales.csv` — a synthetic seat-sales dataset (seeded, deterministic;
  none of its numbers describe a real product).
