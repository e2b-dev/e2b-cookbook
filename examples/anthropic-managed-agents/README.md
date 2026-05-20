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

## Examples

| Language | Example | What it includes |
| --- | --- | --- |
| Python | [python](./python) | E2B template builder, long-running Anthropic `EnvironmentWorker`, setup scripts, and a session smoke driver. |
| JavaScript | [javascript](./javascript) | E2B template builder, TypeScript worker/webhook runtime, setup scripts, and a session smoke driver. |
