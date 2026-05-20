# JavaScript Webhook Worker Implementation

This is the complete webhook shape: start an auto-resumable E2B sandbox, expose `/webhook`, verify
Anthropic's signed event, and start the SDK worker when Anthropic sends
`session.status_run_started`.

## Start the Auto-Resume E2B Sandbox

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Sandbox } from "e2b";
import Anthropic from "@anthropic-ai/sdk";

const REMOTE_DIR = "/opt/anthropic-managed-agents-js";
const REMOTE_SRC_DIR = `${REMOTE_DIR}/src`;
const REMOTE_WORKDIR = "/mnt/session";
const REMOTE_TSX = `${REMOTE_DIR}/node_modules/.bin/tsx`;
const REMOTE_WEBHOOK = `${REMOTE_SRC_DIR}/webhook-runtime.ts`;
const REMOTE_WEBHOOK_LOG = `${REMOTE_DIR}/webhook.log`;
const REMOTE_WEBHOOK_PID = `${REMOTE_DIR}/webhook.pid`;

export async function startWebhookSandbox({
  anthropicApiKey,
  environmentId,
  environmentKey,
  webhookSigningKey,
  templateName = "anthropic-managed-agents-js",
  port = 8000,
}: {
  anthropicApiKey: string;
  environmentId: string;
  environmentKey: string;
  webhookSigningKey?: string;
  templateName?: string;
  port?: number;
}) {
  const sandbox = await Sandbox.create(templateName, {
    timeoutMs: 3_600_000,
    lifecycle: { onTimeout: "pause", autoResume: true },
    metadata: {
      managed_by: "anthropic-managed-agents-e2b-js-webhook",
      "anthropic.environment_id": environmentId,
    },
  });

  await sandbox.commands.run(`mkdir -p ${REMOTE_SRC_DIR}`, { timeoutMs: 15_000 });
  await sandbox.files.write([
    {
      path: REMOTE_WEBHOOK,
      data: await readFile(resolve("src", "webhook-runtime.ts"), "utf8"),
    },
  ]);

  const envs: Record<string, string> = {
    ANTHROPIC_ENVIRONMENT_ID: environmentId,
    ANTHROPIC_ENVIRONMENT_KEY: environmentKey,
    WORKER_MAX_IDLE_SECONDS: "300",
    LOG_LEVEL: "INFO",
    WEBHOOK_PORT: String(port),
  };
  if (webhookSigningKey) {
    envs.ANTHROPIC_WEBHOOK_SIGNING_KEY = webhookSigningKey;
  }

  const handle = await sandbox.commands.run(
    `bash -lc ${JSON.stringify(`exec ${REMOTE_TSX} ${REMOTE_WEBHOOK} >> ${REMOTE_WEBHOOK_LOG} 2>&1`)}`,
    { background: true, cwd: REMOTE_WORKDIR, envs },
  );
  await sandbox.files.write(REMOTE_WEBHOOK_PID, `${handle.pid}\n`);
  await handle.disconnect();

  const client = new Anthropic({ apiKey: anthropicApiKey });
  await client.beta.environments.update(environmentId, {
    metadata: { e2b_webhook_sandbox_id: sandbox.sandboxId },
  });

  console.log(`Anthropic webhook URL: https://${sandbox.getHost(port)}/webhook`);
  return sandbox;
}
```

## Webhook Server

```ts
import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const REMOTE_DIR = "/opt/anthropic-managed-agents-js";
const REMOTE_WORKDIR = "/mnt/session";
const REMOTE_TSX = `${REMOTE_DIR}/node_modules/.bin/tsx`;
const REMOTE_WORKER = `${REMOTE_DIR}/src/worker-runtime.ts`;
const REMOTE_PID = `${REMOTE_DIR}/worker.pid`;
const REMOTE_LOG = `${REMOTE_DIR}/worker.log`;

const client = new Anthropic({ apiKey: "not-needed" });

function workerEnv() {
  return {
    ANTHROPIC_ENVIRONMENT_ID: process.env.ANTHROPIC_ENVIRONMENT_ID,
    ANTHROPIC_ENVIRONMENT_KEY: process.env.ANTHROPIC_ENVIRONMENT_KEY,
    WORKER_MAX_IDLE_SECONDS: process.env.WORKER_MAX_IDLE_SECONDS,
    LOG_LEVEL: process.env.LOG_LEVEL,
    PATH: process.env.PATH,
    HOME: process.env.HOME,
  };
}

function workerIsRunning() {
  if (!existsSync(REMOTE_PID)) return false;
  const pid = Number(readFileSync(REMOTE_PID, "utf8").trim());
  return Number.isInteger(pid) && existsSync(`/proc/${pid}`);
}

function startWorkerIfNeeded() {
  if (workerIsRunning()) return;

  const log = createWriteStream(REMOTE_LOG, { flags: "a" });
  const child = spawn(REMOTE_TSX, [REMOTE_WORKER], {
    cwd: REMOTE_WORKDIR,
    detached: true,
    env: workerEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.unref();
  writeFileSync(REMOTE_PID, `${child.pid}\n`);
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleWebhook(request: IncomingMessage, response: ServerResponse) {
  const signingKey = process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("ANTHROPIC_WEBHOOK_SIGNING_KEY is required");
    return;
  }

  const body = await readBody(request);
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
      startWorkerIfNeeded();
    }

    response.writeHead(204);
    response.end();
  } catch {
    response.writeHead(401, { "content-type": "text/plain" });
    response.end("invalid signature");
  }
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, worker_running: workerIsRunning() }));
    return;
  }

  if (request.method === "POST" && request.url === "/webhook") {
    void handleWebhook(request, response);
    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
});

server.listen(Number(process.env.WEBHOOK_PORT ?? "8000"), "0.0.0.0");
```

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

Anthropic also sends signature headers. Pass the raw body and request headers to
`client.beta.webhooks.unwrap(...)`; do not parse and reserialize the JSON before verification.

## Stop and Clear Metadata

```ts
import Anthropic from "@anthropic-ai/sdk";
import { Sandbox } from "e2b";

export async function stopWebhookSandbox(apiKey: string, environmentId: string, sandboxId: string) {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.kill();

  const client = new Anthropic({ apiKey });
  const environment = await client.beta.environments.retrieve(environmentId);
  if (environment.metadata.e2b_webhook_sandbox_id === sandboxId) {
    await client.beta.environments.update(environmentId, {
      metadata: { e2b_webhook_sandbox_id: null },
    });
  }
}
```
