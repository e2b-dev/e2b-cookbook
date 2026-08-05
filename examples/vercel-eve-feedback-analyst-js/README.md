# Vercel eve Feedback Analyst on E2B (JavaScript)

A feedback analyst agent built on [eve](https://eve.dev/docs), Vercel's agent
framework, with [`@e2b/eve-sandbox`](https://www.npmjs.com/package/@e2b/eve-sandbox)
as its sandbox backend. Ask it a product question in plain language; it writes
Python, runs it on E2B against a seeded feedback corpus, and hands back a
published HTML report with charts.

The seeded corpus in `agent/sandbox/workspace/data/` is **synthetic** — invented
organizations, users, and quotes written to look like a real product feedback
export. It is fixture data for the example, not E2B usage data, and none of its
numbers describe a real product.

## Why run eve on E2B

Every eve agent has exactly one sandbox — the environment behind its built-in
`bash`, `read_file`, `write_file`, `glob`, and `grep` tools. Pointing that
backend at E2B moves the agent's whole execution environment onto E2B
infrastructure, not just a single code-interpreter tool call:

- **Analysis compute is isolated** from both the app runtime and the developer's
  machine. A generated script cannot touch either.
- **The toolchain is installed once.** `bootstrap` pip-installs pandas and
  matplotlib at template build time and E2B bakes the result into a reusable
  snapshot, so sessions fork it in about a second instead of reinstalling.
- **Egress is denied per session.** Customer feedback is the input here, so
  `onSession` sets `networkPolicy: "deny-all"` — a generated script has no way to
  exfiltrate it.
- **The report is still reachable.** E2B's network policy governs egress, not
  ingress, so the sandbox serves its HTML report over a public tunnel while
  locked down. No tradeoff between the two.

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env`:

```bash
cp .env.example .env
```

```bash
E2B_API_KEY=your_e2b_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

Both are required — Anthropic for the model, E2B for the sandbox. `.env` is
gitignored.

3. Run:

```bash
pnpm dev --tools full
```

`pnpm dev` runs `eve dev`, which serves on `http://127.0.0.1:2000/` and opens a
terminal UI. `--tools full` expands tool calls inline, which is what makes the
sandbox work visible; drop it and each tool call collapses to one line.

If the port is taken, `eve dev` refuses to start and tells you to attach to the
existing server instead. Check with `lsof -nP -iTCP:2000 -sTCP:LISTEN`.

The first run is slower: eve builds the sandbox template — running `bootstrap`,
which pip-installs the analysis toolchain — and bakes it into a reusable E2B
snapshot. Every later session boots from that snapshot.

There is no web UI. This is an agent-only project.

## Try it

Ask a business question the way a PM would. Don't name files, paths, or tools —
the agent already knows the corpus is there, and watching it reach for the
sandbox on its own is the point:

> Synthesize the strongest themes in the feedback from the last six weeks. Size
> each one by responses and by distinct organizations, and cross-tab plan against
> product area.

The cross-tab is what the fixed tools cannot express, so it forces `run_analysis`
and therefore the sandbox. You should see:

1. `search_feedback` / `feedback_stats` — in-process, fast, returns citable ids
2. `run_analysis` — **the sandbox call.** The agent writes a Python script, eve
   puts it at `/workspace/analysis/<id>.py` inside the E2B sandbox, runs it
   against the seeded JSON, and returns stdout
3. `run_analysis` again, writing the report and its charts into `/workspace/report/`
4. `publish_report` — starts the server, returns the public URL
5. A two-or-three-sentence reply ending in the link

Two good follow-ups:

> Line feedback volume up against the onboarding activation funnel, week by week.

> Draft an issue for the strongest theme.

The second pauses for approval — `draft_issue` renders a draft and stops, and it
rejects invented feedback ids.

For headless runs (recording, CI, scripting):

```bash
pnpm dev --no-ui &
npx eve invoke -u http://127.0.0.1:2000/ 'Cross-tab feedback responses and distinct orgs by plan against product area.'
```

`eve invoke` prints a JSON result with the final message plus a
`continuationToken` for follow-up turns.

## The HTML report

The agent writes a report inside the sandbox, serves it, and replies with a link:

```
Workspace and key scoping is the strongest theme — 14 responses from 9 of 19
orgs, and the only product area with a mean rating under 3 ...

https://8000-iu2nxbq4timzsdiuopn1q.e2b.app
```

The page carries the whole argument: scope, ranked themes with verbatim quotes
and ids, the plan × product-area cross-tab, charts, what the data cannot tell
yet, and one safest next action. Charts render from matplotlib on the Agg
backend. Every `.png` and `.csv` the script produced sits in the same served
folder, one click away as a download.

Note the sandbox auto-pauses after 30 minutes idle, and a paused sandbox's
tunnel goes down with it. The link is good for the session, not for pasting into
a doc.

## How it works

| Path | Runs where | Does |
| --- | --- | --- |
| `agent/sandbox/sandbox.ts` | — | Selects the E2B backend, pins the toolchain, sets `deny-all` per session |
| `agent/sandbox/workspace/data/*.json` | seeded into E2B | Feedback and analytics exports, mirrored to `/workspace/data/` at session start |
| `agent/tools/search_feedback.ts`, `feedback_stats.ts`, `query_product_analytics.ts` | app runtime | Fixed queries that return citable response ids |
| `agent/tools/run_analysis.ts` | E2B sandbox | Writes a Python script to `/workspace` and runs it with pandas + matplotlib |
| `agent/tools/publish_report.ts` | E2B sandbox | Serves `/workspace/report/` and returns the public URL |
| `agent/skills/feedback-synthesis.md` | — | The synthesis playbook the agent loads on request |

`publish_report` takes no HTML. The report is already on disk in the sandbox, so
chart bytes never pass through the model's context. Starting the server is
idempotent; a second call reuses the running one.

It resolves the URL through E2B directly, because eve's `SandboxSession` is
backend-neutral and exposes no host, port, or sandbox id. The join is that eve's
`sandbox.id` *is* the session key `@e2b/eve-sandbox` stamps on the sandbox, so
the tool looks the sandbox up by metadata and calls `getHost(8000)` — the same
lookup the backend uses to reattach a session.

The agent is instructed to cite response ids for every claim and to report
organization counts alongside raw response counts.

To confirm the work really ran on E2B, in a second terminal:

```bash
node -e '
import("e2b").then(async ({ Sandbox }) => {
  const p = Sandbox.list({ query: { state: ["running"] } });
  const items = await p.nextItems();
  for (const s of items.filter((x) => x.metadata?.eveBackend === "e2b")) {
    console.log(s.sandboxId, s.metadata.agent, s.metadata.sessionId);
  }
});'
```

`eveBackend: "e2b"` is stamped by `@e2b/eve-sandbox` on every sandbox it creates,
and `sessionId` matches the session in the UI.

## Troubleshooting

**Stuck on `waiting for sandbox template prewarm`.** Editing authored agent
source — including `agent/skills/*.md` and `agent/sandbox/sandbox.ts` — changes
eve's template key and forces a snapshot rebuild, so the next turn stalls for a
minute or two. Restarting `eve dev` repeatedly during that rebuild strands
unclaimed prewarm sandboxes: eve waits on one that already finished its
bootstrap, the workflow queue times out, and you get `Queue delivery failed at
the transport … retrying` on a loop. Stop the dev server, kill every eve-owned
sandbox with no `sessionId` in its metadata, and start again.

Interrupting a prewarm can also leave a lock behind at
`.eve/sandbox-cache/template-locks/e2b/*.lock`. eve only treats a lock as stale
after 30 minutes, so if the ticker climbs with no `creating E2B template sandbox`
log line, delete the lock directory and rerun.

## Cleanup

Stopping `eve dev` stops the sandboxes it started. To sweep anything left over —
and only eve's, leaving other E2B workloads alone — filter on
`metadata.eveBackend === "e2b"` and call `Sandbox.kill(id)` per match. The
bootstrap snapshot is a separate artifact and survives, which is what you want:
the next run reuses it instead of reinstalling pandas.

## References

- [eve docs](https://eve.dev/docs) — the agent framework
- [eve sandbox guide](https://eve.dev/docs/sandbox) — backends, lifecycle, network policy
- [`@e2b/eve-sandbox`](https://github.com/e2b-dev/eve-sandbox) — the E2B backend for eve
- [E2B docs](https://e2b.dev/docs)
