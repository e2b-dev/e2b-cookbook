# JavaScript App-Owned Webhook Implementation

This is the complete app-owned webhook shape: Anthropic calls your app, your app verifies the
webhook, then your app routes work to an E2B worker sandbox.

## App Webhook Server

```ts
import Anthropic from "@anthropic-ai/sdk";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { WORKER_SANDBOX_METADATA_KEY, retrieveEnvironment } from "../src/environment.js";
import { ensureWorkerSandbox } from "../src/sandbox-worker.js";
import { loadSettings, requireSetting } from "../src/settings.js";

async function currentWorkerSandboxId(settings) {
  const environment = await retrieveEnvironment({
    apiKey: requireSetting(settings.anthropicApiKey, "ANTHROPIC_API_KEY"),
    environmentId: requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID"),
  });
  return environment.metadata[WORKER_SANDBOX_METADATA_KEY];
}

async function ensureWorkerForEvent(settings) {
  return ensureWorkerSandbox(settings, {
    sandboxId: await currentWorkerSandboxId(settings),
    templateName: "anthropic-managed-agents",
    timeoutSeconds: 3600,
    workerMaxIdleSeconds: 300,
    logLevel: "INFO",
  });
}
```

## Verify and Route the Webhook

```ts
async function handleWebhook(request: IncomingMessage, response: ServerResponse) {
  const settings = loadSettings();
  const signingKey = settings.anthropicWebhookSigningKey;
  if (!signingKey) {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("ANTHROPIC_WEBHOOK_SIGNING_KEY is required");
    return;
  }
  const body = await readBody(request);
  const client = new Anthropic({
    apiKey: requireSetting(settings.anthropicApiKey, "ANTHROPIC_API_KEY"),
  });

  try {
    const event = client.beta.webhooks.unwrap(body, {
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(", ") : (value ?? ""),
        ]),
      ),
      key: signingKey,
    });

    if (event.data.type === "session.status_run_started") {
      const sandbox = await ensureWorkerForEvent(settings);
      response.writeHead(204, { "x-e2b-worker-sandbox-id": sandbox.sandboxId });
      response.end();
      return;
    }

    response.writeHead(204);
    response.end();
  } catch {
    response.writeHead(400, { "content-type": "text/plain" });
    response.end("invalid signature");
  }
}
```

## Worker Routing

The app uses environment metadata as the lookup table:

```ts
async function currentWorkerSandboxId(settings) {
  const environment = await retrieveEnvironment({
    apiKey: requireSetting(settings.anthropicApiKey, "ANTHROPIC_API_KEY"),
    environmentId: requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID"),
  });
  return environment.metadata.e2b_worker_sandbox_id;
}
```

Then it calls `ensureWorkerSandbox(...)`. That helper:

1. Reconnects to the stored sandbox id when metadata exists.
2. Uploads the current worker runtime into the sandbox.
3. Checks `/opt/anthropic-managed-agents-js/worker.pid`.
4. Starts the worker only when no live worker process is found.
5. Creates a fresh sandbox and updates metadata if the stored id cannot be reconnected.

## What Anthropic Sends

```json
{
  "id": "event_...",
  "type": "event",
  "created_at": "2026-05-20T09:44:28.000000Z",
  "data": {
    "type": "session.status_run_started",
    "id": "sesn_...",
    "workspace_id": "wrkspc_...",
    "organization_id": "org_..."
  }
}
```

Your app must verify the raw body and headers with `client.beta.webhooks.unwrap(...)` before it
starts or reconnects any sandbox.
