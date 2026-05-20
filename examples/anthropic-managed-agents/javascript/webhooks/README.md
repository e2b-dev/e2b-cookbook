# JavaScript Auto-Resume Webhook Worker

Use this flow when you want Anthropic to wake the E2B worker sandbox on demand. The webhook
receiver runs inside an auto-resumable E2B sandbox.

When a Managed Agents session needs work, Anthropic sends a `session.status_run_started`
webhook, E2B auto-resumes the webhook sandbox, and the webhook handler starts the worker process.

```mermaid
flowchart LR
    session["Managed Agents session"] --> webhook["Anthropic webhook"]
    webhook --> receiver["E2B auto-resume webhook sandbox"]
    receiver --> worker["worker process"]
    worker --> env["Anthropic self-hosted environment"]
    worker --> workdir["/mnt/session"]
```

## Setup

From the parent `javascript/` directory:

```bash
npm install
cp .env.template .env
```

Fill in `../.env`:

| Variable | Notes |
| --- | --- |
| `E2B_API_KEY` | Required to start the webhook sandbox. |
| `E2B_ACCESS_TOKEN` | Required to build the E2B template. |
| `ANTHROPIC_ENVIRONMENT_ID` | Anthropic self-hosted environment id. |
| `ANTHROPIC_ENVIRONMENT_KEY` | Anthropic self-hosted environment key from the [Anthropic Environments workspace](https://platform.claude.com/workspaces/default/environments). |
| `ANTHROPIC_WEBHOOK_SIGNING_KEY` | Required for real webhook deliveries. Start once without it to get the URL, then add it. |

## Build the E2B Template

```bash
make build-template
```

## Start Once to Get the Webhook URL

You can start the webhook sandbox before creating the Anthropic webhook endpoint:

```bash
make start-webhook-server
```

The command prints:

```bash
E2B_WEBHOOK_SANDBOX_ID=...
Anthropic webhook URL: https://.../webhook
```

The command stores `E2B_WEBHOOK_SANDBOX_ID` on the Anthropic environment metadata as
`e2b_webhook_sandbox_id`. That gives another process a lookup path from
`ANTHROPIC_ENVIRONMENT_ID` to the auto-resumable E2B webhook sandbox:

```bash
make show-environment
```

Create an Anthropic webhook endpoint in the [Anthropic Agents workspace](https://platform.claude.com/workspaces/default/agents) with the printed URL and subscribe it to
`session.status_run_started`. For signing details, see Anthropic's
[Managed Agents webhook docs](https://platform.claude.com/docs/en/managed-agents/webhooks).

Save the generated signing key as `ANTHROPIC_WEBHOOK_SIGNING_KEY` in `../.env`, then restart
the webhook sandbox.

Until the key is configured, `/webhook` returns `503`.

## Stop

```bash
make stop-worker SANDBOX_ID=<E2B_WEBHOOK_SANDBOX_ID>
```

If the stopped sandbox ID matches `e2b_webhook_sandbox_id`, the stop command clears that metadata key.

## Notes

- The webhook sandbox uses `lifecycle: { onTimeout: "pause", autoResume: true }`.
- The webhook server is only the event-driven entrypoint. It still starts the same Anthropic
  environment worker used by the orchestrator example.
- This is a simple single-sandbox example, not production per-session isolation.

For a concrete event-by-event walkthrough, see [../EXAMPLE_USAGE.md](../EXAMPLE_USAGE.md).
