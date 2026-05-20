# Public E2B Webhook Template

Use `E2B/claude-managed-agents-webhooks` when you want an E2B sandbox to receive Anthropic Managed
Agents webhooks and execute the work inside that sandbox.

The template starts a webhook server on port `8000` automatically. Anthropic sends
`session.status_run_started` to `/webhook`; the sandbox verifies the webhook signature and starts an
Anthropic `EnvironmentWorker` in `/mnt/session`.

## Start a Sandbox With a Signing Key

```ts
import { Sandbox } from "e2b";

const sandbox = await Sandbox.create("E2B/claude-managed-agents-webhooks", {
  envs: {
    ANTHROPIC_ENVIRONMENT_ID: process.env.ANTHROPIC_ENVIRONMENT_ID!,
    ANTHROPIC_ENVIRONMENT_KEY: process.env.ANTHROPIC_ENVIRONMENT_KEY!,
    ANTHROPIC_WEBHOOK_SIGNING_KEY: process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY!,
    WORKER_MAX_IDLE_SECONDS: "300",
    LOG_LEVEL: "INFO",
  },
  lifecycle: { onTimeout: "pause", autoResume: true },
});

console.log(`https://${sandbox.getHost(8000)}/webhook`);
```

Register the printed URL in the Anthropic Console and subscribe it to
`session.status_run_started`.

## Required Environment Variables

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_ENVIRONMENT_ID` | Self-hosted Managed Agents environment id. |
| `ANTHROPIC_ENVIRONMENT_KEY` | Environment key used by the worker to claim and run work. |
| `ANTHROPIC_WEBHOOK_SIGNING_KEY` | Webhook signing key used to verify Anthropic deliveries. |

Do not pass `ANTHROPIC_API_KEY` into this sandbox. Keep the API key in your application for creating
agents, creating environments, registering webhooks, and sending session messages.

## First-Time Webhook Setup

Anthropic gives you the webhook signing key after you register the endpoint. If you do not have the
signing key yet:

1. Start the sandbox with `ANTHROPIC_ENVIRONMENT_ID` and `ANTHROPIC_ENVIRONMENT_KEY`.
2. Copy `https://<sandbox-host>/webhook` into the Anthropic webhook settings.
3. Save the generated signing key.
4. Write the signing key into the same sandbox:

```ts
await sandbox.files.write("/mnt/session/.anthropic-webhook-signing-key", `${signingKey}\n`);
```

Until the signing key is configured, `/health` returns `200` and `/webhook` returns `503`.

## Runtime Behavior

- The webhook server starts automatically from the template start command.
- The worker runs with `/mnt/session` as its workdir.
- File tools stay constrained to `/mnt/session`; unrestricted paths are not enabled.
- Skills are downloaded under `/mnt/session/skills/<name>/`.
- Generated artifacts should be written under `/mnt/session/outputs`.
- Request bodies larger than 1 MiB are rejected before signature verification.
