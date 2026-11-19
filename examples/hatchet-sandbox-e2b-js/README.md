# Hatchet sandboxes on E2B (TypeScript)

This example runs a [Hatchet](https://hatchet.run) durable task whose commands execute in an E2B sandbox. The task code runs on a Hatchet worker inside this script. Hatchet Cloud's sandbox operator creates the sandbox on E2B, runs the commands and takes a snapshot when the task kills it. The script then reconnects to the sandbox from outside the task and checks that the file it wrote is still there, then deletes the sandbox and its snapshot.

## Prerequisites

1. A [Hatchet Cloud](https://cloud.hatchet.run) tenant. Sandboxes are a Labs Preview feature and are not available on self-hosted Hatchet instances.
2. In the dashboard open Settings, go to Labs Preview and turn on Sandboxes. You need to be a tenant owner or admin to do this.
3. Under Sandboxes choose Connect provider, pick E2B, name it `e2b` and paste your [E2B API key](https://e2b.dev/dashboard). Wait for the credential check on the provider page to pass.

See the Hatchet docs for [setup](https://docs.hatchet.run/v1/sandboxes/setup), [providers](https://docs.hatchet.run/v1/sandboxes/providers) and [using sandboxes](https://docs.hatchet.run/v1/sandboxes/using-sandboxes), and the [`@hatchet-dev/sandbox`](https://www.npmjs.com/package/@hatchet-dev/sandbox) package for the full API.

## Setup and run

Requires Node.js 22 or newer.

```bash
cp .env.example .env   # then set HATCHET_CLIENT_TOKEN
npm install
npm start
```

The script prints two lines and exits 0.

```text
Task ran in sandbox cookbook-<timestamp>: hello from the sandbox on Linux <kernel>
Sandbox cookbook-<timestamp> restored from its E2B snapshot after kill()
```

A run creates one E2B sandbox from the `base` template, one filesystem snapshot stored as an E2B template, and one Hatchet run named `e2b-session`. Everything is deleted in the `finally` block. If the script is interrupted before that, `hatchet.sandbox.delete({ metadata: { example: 'e2b-cookbook' } })` from any Hatchet client removes what is left.

## How it maps onto E2B

`create` starts an E2B sandbox with auto pause on. `exec` runs `sh -c` through E2B's envd with a 300 second cap per command. `kill` stops the sandbox and saves a filesystem snapshot as an E2B template, which is what `connect` starts from. `delete` removes the sandbox and that template. Sandbox size comes from the E2B template, so the `resources` option is rejected for this provider.
