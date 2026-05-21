# Functions to Implement

This is the implementation checklist for wiring Anthropic Managed Agents self-hosted environments
to E2B in JavaScript or TypeScript. The local example implements these functions under
[`src/`](./src/).

## 1. Load Runtime Configuration

Implement `loadSettings()`.

It should load local environment variables and return a typed settings object with:

| Setting | Required for |
| --- | --- |
| `ANTHROPIC_API_KEY` | Creating agents, creating environments, sending sessions, updating environment metadata. |
| `ANTHROPIC_AGENT_ID` | Sending a session message. |
| `ANTHROPIC_ENVIRONMENT_ID` | Starting workers, sending sessions, metadata lookup. |
| `ANTHROPIC_ENVIRONMENT_KEY` | Running the self-hosted environment worker. |
| `ANTHROPIC_WEBHOOK_SIGNING_KEY` | Verifying real webhook deliveries. |

The example reads the repository root `.env` first, then the example-local `.env`.

## 2. Create the Anthropic Environment

Implement `createSelfHostedEnvironment({ apiKey, name })`.

It should call:

```ts
client.beta.environments.create({
  name,
  config: { type: "self_hosted" },
});
```

Print the returned `environment.id` as `ANTHROPIC_ENVIRONMENT_ID`, then send the user to
[Anthropic Environments](https://platform.claude.com/workspaces/default/environments) to generate
`ANTHROPIC_ENVIRONMENT_KEY`.

## 3. Create the Managed Agent

Implement `createAgent({ apiKey, name, model })`.

It should create a Managed Agent with:

- the target model
- a system prompt that says `/mnt/session` is the sandbox workdir
- Anthropic's `agent_toolset_20260401`
- enabled tools: `bash`, `read`, `write`, `edit`, `glob`, `grep`, `web_fetch`, `web_search`

For this cookbook example, the tool permission policy is `always_allow` so the smoke flow can run
without an approval UI.

## 4. Build the E2B Template

Implement `template` and `buildTemplate(templateName)`.

The template should:

- start from Node.js
- install shell utilities used by the Anthropic toolset
- install `@anthropic-ai/sdk`, `tsx`, and `typescript`
- copy the worker and webhook runtime files into `/opt/anthropic-managed-agents-js/src`
- create writable `/mnt/session`
- set `/mnt/session` as the default workdir

`buildTemplate(templateName)` should call E2B's `Template.build(...)` with that template.

## 5. Start an Orchestrator Worker Sandbox

Implement `startWorkerSandbox(settings, options)`.

It should:

1. Require `ANTHROPIC_ENVIRONMENT_ID` and `ANTHROPIC_ENVIRONMENT_KEY`.
2. Connect to `options.sandboxId` if provided, otherwise create a new E2B sandbox from `templateName`.
3. Upload or refresh the worker runtime files.
4. Start the worker process as an E2B background command in `/mnt/session`.
5. Write the worker pid to `/opt/anthropic-managed-agents-js/worker.pid`.
6. Write logs to `/opt/anthropic-managed-agents-js/worker.log`.
7. Disconnect from the E2B background command handle so the local CLI can exit.
8. Update Anthropic environment metadata:

```text
e2b_worker_sandbox_id=<sandbox id>
e2b_worker_sandbox_ids=["<sandbox id>", ...]
```

The process environment passed to the worker must include:

```text
ANTHROPIC_ENVIRONMENT_ID
ANTHROPIC_ENVIRONMENT_KEY
WORKER_MAX_IDLE_SECONDS
LOG_LEVEL
```

## 6. Run the Worker Inside E2B

Implement the worker runtime entrypoint.

It should run Anthropic's SDK worker:

```ts
const client = new Anthropic({
  authToken: environmentKey,
  logger: console,
  logLevel: "info",
});

await client.beta.environments.work
  .worker({
    environmentId,
    environmentKey,
    workdir: "/mnt/session",
    maxIdleMs,
  })
  .run();
```

This is the core handoff. Anthropic's SDK owns polling, claiming work, heartbeating, dispatching
tool calls, and sending tool results back to the session.
Leaving `unrestrictedPaths` unset keeps file tools constrained to the worker `workdir`.
Use a short default idle timeout, such as 30 seconds, so a completed or quiet session does not keep
the single example worker from polling later work for several minutes.
For webhook-driven sandboxes, start a bounded worker process on each `session.status_run_started`
delivery instead of treating one PID as the whole queue. Cap concurrency, and give each worker a
runtime guard so an idle event stream cannot block later sessions indefinitely. If all worker slots
are full, keep a small retry counter so that skipped webhook deliveries start a worker once capacity
opens again.

## 7. Start an Auto-Resume Webhook Sandbox

Implement `startWebhookServerSandbox(settings, options)`.

It should:

1. Require `ANTHROPIC_ENVIRONMENT_ID` and `ANTHROPIC_ENVIRONMENT_KEY`.
2. Connect to `options.sandboxId` if provided, otherwise create an E2B sandbox with:

```ts
lifecycle: { onTimeout: "pause", autoResume: true }
```

3. Upload or refresh the worker and webhook runtime files.
4. Start the webhook server as an E2B background command.
5. Print `https://<sandbox-host>/webhook`.
6. Disconnect from the E2B background command handle so the local CLI can exit.
7. Update Anthropic environment metadata:

```text
e2b_webhook_sandbox_id=<sandbox id>
e2b_webhook_sandbox_ids=["<sandbox id>", ...]
```

## 8. Verify Webhooks and Start the Worker

Implement the `/webhook` handler.

It should:

1. Return `503` when `ANTHROPIC_WEBHOOK_SIGNING_KEY` is not configured.
2. Read the raw request body.
3. Verify the payload with:

```ts
const event = client.beta.webhooks.unwrap(body, {
  headers,
  key: process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY,
});
```

4. If `event.data.type === "session.status_run_started"`, start the worker process if it is not already running.
5. Return `204` for accepted webhook deliveries.

Also implement `/health` so setup can confirm the webhook sandbox is serving HTTP.

## 9. App-Owned Webhook Routing

Implement `app-webhook-server.ts` when webhooks should land on your application instead of inside
an E2B sandbox.

It should:

1. Receive `POST /webhook` in the app process.
2. Verify the raw Anthropic webhook payload with `client.beta.webhooks.unwrap(...)`.
3. Wake an app-side drain of the self-hosted environment work queue.
4. For each claimed session work item, compute the sandbox routing key from
   `APP_SANDBOX_ROUTING_SCOPE`.
5. Reconnect to that key's sandbox and start `worker.handleItem()` with the claimed work id, or
   create a fresh worker sandbox when the assignment is missing or stale.

This keeps webhook policy, routing, observability, and sandbox replacement under app control while
still using the same E2B worker runtime. Add `GET /sandboxes` so operators can inspect the current
session-to-sandbox assignments behind an app-owned bearer token. Do not start a normal
environment-polling worker inside the session sandbox; it can claim a different queued session.

## 10. Send a Session Message

Implement `streamMessage({ apiKey, agentId, environmentId, message })`.

It should:

1. Create a session with `agent` and `environment_id`.
2. Open a session event stream.
3. Send a `user.message`.
4. Print streamed events.
5. Stop when the stream reaches `session.status_idle` with `stop_reason.type === "end_turn"`.

## 11. Upload Files into the E2B Worker Sandbox

Anthropic session `resources` are not available for self-hosted environments. For this E2B pattern,
upload files through E2B before sending the session message:

```ts
import { readFile } from "node:fs/promises";
import { Sandbox } from "e2b";

export async function uploadFileToSandbox({
  sandboxId,
  localPath,
  remotePath,
}: {
  sandboxId: string;
  localPath: string;
  remotePath: string;
}) {
  const sandbox = await Sandbox.connect(sandboxId);
  const data = await readFile(localPath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  await sandbox.files.write(remotePath, arrayBuffer);
  return remotePath;
}
```

Then ask the agent to read the remote path, for example
`/mnt/session/uploads/example-input.txt`.

## 12. Look Up and Clean Up Sandbox Metadata

Implement:

- `retrieveEnvironment({ apiKey, environmentId })`
- `updateEnvironmentMetadata({ apiKey, environmentId, metadata })`
- `clearMatchingSandboxMetadata({ apiKey, environmentId, sandboxId })`
- `uploadFileToSandbox({ sandboxId, localPath, remotePath })`
- `show-environment`

`show-environment` should print:

```text
ANTHROPIC_ENVIRONMENT_ID=...
name=...
e2b_worker_sandbox_id=...
e2b_worker_sandbox_ids=...
e2b_webhook_sandbox_id=...
e2b_webhook_sandbox_ids=...
```

`stopWorkerSandbox(settings, sandboxId)` should kill the E2B sandbox and clear
`e2b_worker_sandbox_id` or `e2b_webhook_sandbox_id` only when the stored value matches the sandbox
being stopped. It should also remove the sandbox id from the matching JSON metadata list.

That gives another process a simple lookup path:

```text
ANTHROPIC_ENVIRONMENT_ID -> environment.metadata.e2b_*_sandbox_ids -> E2B sandbox ids
```
