# Public E2B Webhook Template

Use `E2B/claude-managed-agents-webhooks` when you want an E2B sandbox to receive Anthropic Managed
Agents webhooks and route each session to a persistent E2B worker sandbox.

The template starts a webhook router on port `8000` automatically. Anthropic sends
`session.status_run_started` to `/webhook`; the router verifies the webhook signature, drains the
self-hosted environment queue, and starts or reconnects the E2B worker sandbox for the claimed
session.

## Start a Sandbox With a Signing Key

```ts
import { Sandbox } from "e2b";

const sandbox = await Sandbox.create("E2B/claude-managed-agents-webhooks", {
  lifecycle: { onTimeout: "pause", autoResume: true },
});

await sandbox.files.write([
  {
    path: "/opt/anthropic-managed-agents-js/config/e2b-api-key",
    data: `${process.env.E2B_API_KEY}\n`,
  },
  {
    path: "/opt/anthropic-managed-agents-js/config/anthropic-api-key",
    data: `${process.env.ANTHROPIC_API_KEY}\n`,
  },
  {
    path: "/opt/anthropic-managed-agents-js/config/anthropic-environment-id",
    data: `${process.env.ANTHROPIC_ENVIRONMENT_ID}\n`,
  },
  {
    path: "/opt/anthropic-managed-agents-js/config/anthropic-environment-key",
    data: `${process.env.ANTHROPIC_ENVIRONMENT_KEY}\n`,
  },
  {
    path: "/opt/anthropic-managed-agents-js/config/anthropic-webhook-signing-key",
    data: `${process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY}\n`,
  },
]);

console.log(`https://${sandbox.getHost(8000)}/webhook`);
```

Register the printed URL in the Anthropic Console and subscribe it to
`session.status_run_started`.

## Required Environment Variables

| Variable | Purpose |
| --- | --- |
| `E2B_API_KEY` | Lets the webhook router start or reconnect session worker sandboxes. |
| `ANTHROPIC_API_KEY` | Lets the webhook router verify sessions and claim queued work. |
| `ANTHROPIC_ENVIRONMENT_ID` | Self-hosted Managed Agents environment id. |
| `ANTHROPIC_ENVIRONMENT_KEY` | Environment key used by the worker to claim and run work. |
| `ANTHROPIC_WEBHOOK_SIGNING_KEY` | Webhook signing key used to verify Anthropic deliveries. |

The router sandbox uses `ANTHROPIC_API_KEY` and `E2B_API_KEY` as control-plane credentials. The
session worker sandboxes only receive the environment-scoped worker credentials and the claimed work
id.

## First-Time Webhook Setup

Anthropic gives you the webhook signing key after you register the endpoint. If you do not have the
signing key yet:

1. Start the sandbox and write `E2B_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_ENVIRONMENT_ID`, and
   `ANTHROPIC_ENVIRONMENT_KEY` into `/opt/anthropic-managed-agents-js/config`.
2. Copy `https://<sandbox-host>/webhook` into the Anthropic webhook settings.
3. Save the generated signing key.
4. Write the signing key into the same sandbox:

```ts
await sandbox.files.write(
  "/opt/anthropic-managed-agents-js/config/anthropic-webhook-signing-key",
  `${signingKey}\n`,
);
```

Until the signing key is configured, `/health` returns `200` and `/webhook` returns `503`.

## End-to-End Setup Process

Use this when the E2B sandbox itself is the webhook receiver and session-sandbox router.

1. Create or pick a self-hosted Anthropic Managed Agents environment.
2. Start `E2B/claude-managed-agents-webhooks`.
3. Write the file-backed router config:

```ts
await sandbox.files.write([
  {
    path: "/opt/anthropic-managed-agents-js/config/e2b-api-key",
    data: `${process.env.E2B_API_KEY}\n`,
  },
  {
    path: "/opt/anthropic-managed-agents-js/config/anthropic-api-key",
    data: `${process.env.ANTHROPIC_API_KEY}\n`,
  },
  {
    path: "/opt/anthropic-managed-agents-js/config/anthropic-environment-id",
    data: `${process.env.ANTHROPIC_ENVIRONMENT_ID}\n`,
  },
  {
    path: "/opt/anthropic-managed-agents-js/config/anthropic-environment-key",
    data: `${process.env.ANTHROPIC_ENVIRONMENT_KEY}\n`,
  },
]);
```

4. Register `https://<sandbox-host>/webhook` in Anthropic and subscribe it to
   `session.status_run_started`.
5. Write the webhook signing key back into the same sandbox:

```ts
await sandbox.files.write(
  "/opt/anthropic-managed-agents-js/config/anthropic-webhook-signing-key",
  `${process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY}\n`,
);
```

6. Create a Managed Agents agent that uses the same `environment_id`.
7. Send a normal session message. Anthropic sends the webhook, E2B routes it to the router sandbox,
   the router claims the queued work, and a session-owned E2B worker sandbox handles the task.

The important mental model is that Managed Agents gives the self-hosted environment a queue of work.
The webhook does not contain the task itself; it is the wakeup signal. The router claims queued work,
uses the claimed session id as the default sandbox routing key, and starts the worker with the
claimed work id.

## Smoke Test

After registering the webhook, send a small task that must use the sandbox:

```text
Use bash to echo webhook-smoke-ok. Answer only with that text.
```

Then check the sandbox:

```ts
const health = await fetch(`https://${sandbox.getHost(8000)}/health`);
console.log(await health.json());

const logs = await sandbox.commands.run(
  "tail -200 /opt/anthropic-managed-agents-js/webhook.log || true",
);
console.log(logs.stdout);
```

A healthy run has:

- `/health` returning `ok: true`.
- `GET /sandboxes` showing a session-to-sandbox assignment when called with
  `APP_WEBHOOK_ADMIN_TOKEN`, if configured.
- The assigned worker sandbox log showing `claimed work`, `executing tool`, and a successful
  `POST /v1/sessions/<session>/events`.
- The Anthropic session ending with `session.status_idle` and `stop_reason.type` of `end_turn`.

If the session stays at `requires_action`, check `webhook.log` in the router sandbox first, then the
assigned worker sandbox's `worker.log`. Failed tool-result posts, archived sessions, stale
environment keys, and missing webhook signing keys are visible there when `LOG_LEVEL` is `INFO` or
`DEBUG`.

## Runtime Behavior

- The webhook router starts automatically from the template start command.
- Runtime config files live under `/opt/anthropic-managed-agents-js/config`, outside the agent
  workdir, with restrictive file permissions.
- Each session worker sandbox runs with `/mnt/session` as its workdir.
- File tools stay constrained to `/mnt/session`; unrestricted paths are not enabled.
- Skills are downloaded under `/mnt/session/skills/<name>/`.
- Generated artifacts should be written under `/mnt/session/outputs`.
- Request bodies larger than 1 MiB are rejected before signature verification.
- By default, sandbox routing is scoped to `environment_id + session_id`, so follow-up turns for the
  same Managed Agents session reconnect to the same E2B sandbox.
- Set `/opt/anthropic-managed-agents-js/config/app-sandbox-routing-scope` to `agent` or
  `environment` if you intentionally want broader sandbox reuse.
- Each worker defaults to a 30-second session idle timeout and a 180-second process runtime guard.
  Override the idle timeout with
  `/opt/anthropic-managed-agents-js/config/worker-max-idle-seconds`; override the runtime guard with
  `WORKER_RUN_SECONDS` in the template environment if your tasks usually run longer.
