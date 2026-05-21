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
  lifecycle: { onTimeout: "pause", autoResume: true },
});

await sandbox.files.write([
  {
    path: "/mnt/session/.anthropic-environment-id",
    data: `${process.env.ANTHROPIC_ENVIRONMENT_ID}\n`,
  },
  {
    path: "/mnt/session/.anthropic-environment-key",
    data: `${process.env.ANTHROPIC_ENVIRONMENT_KEY}\n`,
  },
  {
    path: "/mnt/session/.anthropic-webhook-signing-key",
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
| `ANTHROPIC_ENVIRONMENT_ID` | Self-hosted Managed Agents environment id. |
| `ANTHROPIC_ENVIRONMENT_KEY` | Environment key used by the worker to claim and run work. |
| `ANTHROPIC_WEBHOOK_SIGNING_KEY` | Webhook signing key used to verify Anthropic deliveries. |

Do not pass `ANTHROPIC_API_KEY` into this sandbox. Keep the API key in your application for creating
agents, creating environments, registering webhooks, and sending session messages.

## First-Time Webhook Setup

Anthropic gives you the webhook signing key after you register the endpoint. If you do not have the
signing key yet:

1. Start the sandbox and write `ANTHROPIC_ENVIRONMENT_ID` and `ANTHROPIC_ENVIRONMENT_KEY` into
   `/mnt/session/.anthropic-environment-id` and `/mnt/session/.anthropic-environment-key`.
2. Copy `https://<sandbox-host>/webhook` into the Anthropic webhook settings.
3. Save the generated signing key.
4. Write the signing key into the same sandbox:

```ts
await sandbox.files.write("/mnt/session/.anthropic-webhook-signing-key", `${signingKey}\n`);
```

Until the signing key is configured, `/health` returns `200` and `/webhook` returns `503`.

## End-to-End Setup Process

Use this when the E2B sandbox itself is the webhook receiver and worker host.

1. Create or pick a self-hosted Anthropic Managed Agents environment.
2. Keep `ANTHROPIC_API_KEY` in your app or local setup only. Do not write it into the sandbox.
3. Start `E2B/claude-managed-agents-webhooks`.
4. Write the file-backed sandbox config:

```ts
await sandbox.files.write([
  {
    path: "/mnt/session/.anthropic-environment-id",
    data: `${process.env.ANTHROPIC_ENVIRONMENT_ID}\n`,
  },
  {
    path: "/mnt/session/.anthropic-environment-key",
    data: `${process.env.ANTHROPIC_ENVIRONMENT_KEY}\n`,
  },
]);
```

5. Register `https://<sandbox-host>/webhook` in Anthropic and subscribe it to
   `session.status_run_started`.
6. Write the webhook signing key back into the same sandbox:

```ts
await sandbox.files.write(
  "/mnt/session/.anthropic-webhook-signing-key",
  `${process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY}\n`,
);
```

7. Create a Managed Agents agent that uses the same `environment_id`.
8. Send a normal session message. Anthropic sends the webhook, E2B routes it to this sandbox, the
   webhook server verifies the signature, and a bounded worker process claims the queued work.

The important mental model is that Managed Agents gives the self-hosted environment a queue of work.
The webhook does not contain the task itself; it is the wakeup signal. The worker still claims the
work from Anthropic with `ANTHROPIC_ENVIRONMENT_KEY`, runs the enabled tools in `/mnt/session`, and
posts `user.tool_result` events back to the session.

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
  "tail -200 /opt/anthropic-managed-agents-js/worker.log || true",
);
console.log(logs.stdout);
```

A healthy run has:

- `/health` returning `ok: true`.
- `worker_count` greater than zero while work is active.
- Worker logs showing `claimed work`, `executing tool`, and a successful
  `POST /v1/sessions/<session>/events`.
- The Anthropic session ending with `session.status_idle` and `stop_reason.type` of `end_turn`.

If the session stays at `requires_action`, check `worker.log` first. Failed tool-result posts,
archived sessions, stale environment keys, and missing webhook signing keys are visible there when
`LOG_LEVEL` is `INFO` or `DEBUG`.

## Runtime Behavior

- The webhook server starts automatically from the template start command.
- The worker runs with `/mnt/session` as its workdir.
- File tools stay constrained to `/mnt/session`; unrestricted paths are not enabled.
- Skills are downloaded under `/mnt/session/skills/<name>/`.
- Generated artifacts should be written under `/mnt/session/outputs`.
- Request bodies larger than 1 MiB are rejected before signature verification.
- The webhook server starts one bounded worker process per `session.status_run_started` event, up to
  `MAX_WORKERS` concurrent workers. This keeps later sessions moving even when an older session is
  still waiting on an idle event stream.
- If a webhook arrives while all worker slots are full, the server retries the skipped worker start
  until a slot opens.
- Each worker defaults to a 30-second session idle timeout and a 180-second process runtime guard.
  Override the idle timeout with `/mnt/session/.worker-max-idle-seconds`; override the runtime guard
  with `WORKER_RUN_SECONDS` in the template environment if your tasks usually run longer.
