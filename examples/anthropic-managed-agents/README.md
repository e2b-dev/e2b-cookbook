# Anthropic Managed Agents on E2B

Run Anthropic Managed Agents self-hosted environments from E2B sandboxes.

## How It Works

Under the hood, a self-hosted Anthropic Managed Agents environment gives you a queue of work for
your own worker to handle. You can keep a worker connected and polling for that work, or you can use
webhooks to wake your infrastructure when a session starts running.

Anthropic owns the agent session and tool-call protocol, but the self-hosted sandbox runtime is not
opinionated about where those tool calls run or how you route them. In practice, that means each
self-hosted setup needs a small handler that starts or finds the right sandbox, runs the
`EnvironmentWorker`, and maps files, logs, outputs, and cleanup to your use case. The examples below
show the common shapes: direct app orchestration, an auto-resumable webhook sandbox, and an
app-owned webhook router.

## State Scope

Each example chooses what a sandbox means for persistent state:

| Flow | Sandbox state scope | When to use it |
| --- | --- | --- |
| Direct orchestration | A worker sandbox attached to the self-hosted environment queue. Files in `/mnt/session` persist for that sandbox and can be reused by any session it claims. | Simple demos, batch workers, or shared worker pools. |
| Sandbox-hosted webhooks | An auto-resumable webhook router sandbox plus session-routed worker sandboxes. The default worker sandbox key is `environment_id + session_id`. | A reusable webhook endpoint with persistent per-session filesystem state. |
| App-hosted webhooks | An app-owned routing key. The default is `environment_id + session_id`, so each Managed Agents session gets its own sandbox and persistent `/mnt/session`. | User-facing agents where follow-up turns need deterministic session-owned files. |

Use the JavaScript public webhook template or the `app-webhooks/` flow when persistent state should
belong to a specific session, agent, or environment. Direct polling workers still poll the Anthropic
environment queue directly and are not strict per-session isolation.

## Examples

| Language | Example | What it includes |
| --- | --- | --- |
| Python | [python](./python) | E2B template builder, long-running Anthropic `EnvironmentWorker`, setup scripts, and a session smoke driver. |
| JavaScript | [javascript](./javascript) | E2B template builder, TypeScript worker/webhook runtime, setup scripts, and a session smoke driver. |

## Public Webhook Template

Use `E2B/claude-managed-agents-webhooks` if you want a sandbox that starts an Anthropic Managed
Agents webhook router automatically. The router receives `session.status_run_started`, claims work,
and starts or reconnects the E2B worker sandbox for that session. The router needs `E2B_API_KEY`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_ENVIRONMENT_ID`, `ANTHROPIC_ENVIRONMENT_KEY`, and
`ANTHROPIC_WEBHOOK_SIGNING_KEY`.

See [javascript/webhooks/PUBLIC_TEMPLATE.md](./javascript/webhooks/PUBLIC_TEMPLATE.md) for the
copy-paste SDK example and the end-to-end setup and smoke-test process.
