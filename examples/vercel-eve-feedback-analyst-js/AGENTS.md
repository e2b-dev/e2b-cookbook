# eve Agent App

This project uses the eve framework. Before writing code, read the relevant guide
from the installed eve package docs. In most installs, those docs are at
`node_modules/eve/docs/`. In workspaces or local package installs, resolve the
installed `eve` package location first and read its `docs/` directory. If
package docs are unavailable, use https://eve.dev/docs as a fallback.

Before implementing an integration yourself, use
`eve registry search <query>` or `eve registry list` to discover available
integrations. Inspect one with `eve registry view <item>`, then install it with
`eve add <item>`.

# Sandbox

The agent's bash environment runs on E2B via `@e2b/eve-sandbox`, configured in
`agent/sandbox/sandbox.ts`. Read `docs/sandbox.mdx` in the installed eve package
before changing it.

Two things follow from that layout and are easy to break:

- `agent/sandbox/workspace/data/*.json` are the canonical copies of both exports.
  They are seeded into `/workspace/data/` at session start *and* imported by
  `agent/lib/data.ts` for the in-process tools. Do not add a second copy at the
  project root; move the originals if they need to live elsewhere.
- `bootstrap` pins pandas and `revalidationKey` carries that pin. Change the
  version in one place — the constant — or the snapshot will not rebuild.

There is no web UI. This is an agent-only project; drive it with `eve dev`,
`eve invoke`, or `eve start`.
