# JavaScript App-Owned Webhook Implementation

This walkthrough includes every app-webhook-specific piece of code. It assumes the shared
TypeScript modules from the parent example already exist: settings loading, Anthropic environment
helpers, template build, and the E2B worker runtime. Add the files and edits below to turn that base
worker package into this flow:

```text
Anthropic webhook -> your app -> Anthropic environment metadata -> E2B worker sandbox
```

## 1. Add the App Webhook Server

Create `src/app-webhook-server.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_SANDBOX_TIMEOUT_SECONDS,
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_WORKER_MAX_IDLE_SECONDS,
} from "./constants.js";
import { JsonSandboxStore } from "./app-sandbox-store.js";
import { ensureWorkerSandbox } from "./sandbox-worker.js";
import { loadSettings, requireSetting, type Settings } from "./settings.js";

const store = new JsonSandboxStore();

function webhookClient(settings: Settings) {
  return new Anthropic({
    apiKey: requireSetting(settings.anthropicApiKey, "ANTHROPIC_API_KEY"),
  });
}

function sessionId(event: unknown) {
  const id = (event as { data?: { id?: unknown } }).data?.id;
  if (!id) {
    throw new Error("webhook event does not include data.id");
  }
  return String(id);
}

async function ensureWorkerForEvent(settings: Settings, event: unknown) {
  const environmentId = requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID");
  const session = sessionId(event);
  const assignment = await store.get({ environmentId, sessionId: session });
  const sandbox = await ensureWorkerSandbox(settings, {
    sandboxId: assignment?.sandboxId,
    templateName: DEFAULT_TEMPLATE_NAME,
    timeoutSeconds: DEFAULT_SANDBOX_TIMEOUT_SECONDS,
    workerMaxIdleSeconds: DEFAULT_WORKER_MAX_IDLE_SECONDS,
    logLevel: DEFAULT_LOG_LEVEL,
  });
  await store.upsert({
    environmentId,
    sessionId: session,
    sandboxId: sandbox.sandboxId,
  });
  return sandbox;
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function handleWebhook(request: IncomingMessage, response: ServerResponse) {
  const settings = loadSettings();
  const signingKey = settings.anthropicWebhookSigningKey;
  if (!signingKey) {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("ANTHROPIC_WEBHOOK_SIGNING_KEY is required");
    return;
  }
  const body = await readBody(request);

  try {
    const event = webhookClient(settings).beta.webhooks.unwrap(body, {
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(", ") : (value ?? ""),
        ]),
      ),
      key: signingKey,
    });

    if (event.data.type === "session.status_run_started") {
      const sandbox = await ensureWorkerForEvent(settings, event);
      response.writeHead(204, { "x-e2b-worker-sandbox-id": sandbox.sandboxId });
      response.end();
      return;
    }

    response.writeHead(204);
    response.end();
  } catch (error) {
    console.error(error);
    response.writeHead(400, { "content-type": "text/plain" });
    response.end("invalid signature");
  }
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && request.url === "/sandboxes") {
    void store.list().then((assignments) => writeJson(response, 200, { sandboxes: assignments }));
    return;
  }

  if (request.method === "POST" && request.url === "/webhook") {
    void handleWebhook(request, response);
    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
});

const port = Number(process.env.PORT ?? "8000");
server.listen(port, "0.0.0.0", () => {
  console.log(`app webhook server listening on ${port}`);
});
```

Create `src/app-sandbox-store.ts` for the app-owned assignments:

```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { exampleRoot } from "./settings.js";

export type SandboxAssignment = {
  environmentId: string;
  sessionId: string;
  sandboxId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function storePath() {
  return process.env.APP_SANDBOX_STORE_PATH ?? resolve(exampleRoot, ".managed-agent-sandbox-store.json");
}

export class JsonSandboxStore {
  constructor(private readonly path = storePath()) {}

  async list() {
    return this.read();
  }

  async get({ environmentId, sessionId }: { environmentId: string; sessionId: string }) {
    const assignments = await this.read();
    return assignments.find(
      (item) => item.environmentId === environmentId && item.sessionId === sessionId,
    );
  }

  async upsert({ environmentId, sessionId, sandboxId }: {
    environmentId: string;
    sessionId: string;
    sandboxId: string;
  }) {
    const assignments = await this.read();
    const existing = assignments.find(
      (item) => item.environmentId === environmentId && item.sessionId === sessionId,
    );
    const timestamp = new Date().toISOString();
    await this.write([
      ...assignments.filter(
        (item) => !(item.environmentId === environmentId && item.sessionId === sessionId),
      ),
      {
        environmentId,
        sessionId,
        sandboxId,
        status: "active",
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      },
    ]);
  }

  async removeSandbox(sandboxId: string) {
    await this.write((await this.read()).filter((item) => item.sandboxId !== sandboxId));
  }

  private async read(): Promise<SandboxAssignment[]> {
    try {
      const raw = JSON.parse(await readFile(this.path, "utf8"));
      return Array.isArray(raw) ? raw : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async write(assignments: SandboxAssignment[]) {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(assignments, null, 2)}\n`);
  }
}
```

## 2. Add Worker Ensure Helpers

Add these exports to `src/sandbox-worker.ts`. They reuse the same E2B worker runtime as the
orchestrator example, but make the operation idempotent for repeated webhooks.

```ts
export async function workerProcessIsRunning(sandbox: Sandbox) {
  const check = `
    set -eu
    test -f ${REMOTE_PID}
    pid="$(cat ${REMOTE_PID})"
    test -n "$pid"
    kill -0 "$pid"
  `;
  const result = await sandbox.commands.run(`bash -lc ${JSON.stringify(check)}`, {
    timeoutMs: 5_000,
  });
  return result.exitCode === 0;
}

export async function ensureWorkerProcess(
  sandbox: Sandbox,
  settings: Settings,
  options: WorkerOptions = {},
) {
  await uploadRuntime(sandbox);
  if (await workerProcessIsRunning(sandbox)) {
    return;
  }
  const handle = await sandbox.commands.run(`bash -lc ${JSON.stringify(`exec ${REMOTE_TSX} ${REMOTE_WORKER} >> ${REMOTE_LOG} 2>&1`)}`, {
    background: true,
    cwd: REMOTE_WORKDIR,
    envs: workerEnv(settings, options),
  });
  await sandbox.files.write(REMOTE_PID, `${handle.pid}\n`);
  await handle.disconnect();
}

export async function ensureWorkerSandbox(settings: Settings, options: WorkerOptions = {}) {
  try {
    return await startWorkerSandbox(settings, options);
  } catch (error) {
    if (!options.sandboxId) {
      throw error;
    }
    return startWorkerSandbox(settings, { ...options, sandboxId: undefined });
  }
}
```

Then update `startWorkerSandbox(...)` so it calls `ensureWorkerProcess(...)` instead of always
starting a new worker process:

```ts
export async function startWorkerSandbox(settings: Settings, options: WorkerOptions = {}) {
  requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID");
  requireSetting(settings.anthropicEnvironmentKey, "ANTHROPIC_ENVIRONMENT_KEY");

  const sandbox = await createOrConnectWorkerSandbox(settings, options);
  await ensureWorkerProcess(sandbox, settings, options);
  if (settings.anthropicApiKey) {
    await updateEnvironmentMetadata({
      apiKey: settings.anthropicApiKey,
      environmentId: requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID"),
      metadata: { [WORKER_SANDBOX_METADATA_KEY]: sandbox.sandboxId },
    });
  }

  return sandbox;
}
```

## 3. Add the Package Script

Add this script to `package.json`:

```json
{
  "scripts": {
    "start-app-webhook-server": "tsx src/app-webhook-server.ts"
  }
}
```

## 4. Add the Use-Case Makefile

Create `app-webhooks/Makefile`:

```make
.PHONY: build-template show-environment start-app-webhook-server stop-worker

build-template:
	npm --prefix .. run build-template

show-environment:
	npm --prefix .. run show-environment

start-app-webhook-server:
	npm --prefix .. run start-app-webhook-server

stop-worker:
	npm --prefix .. run stop-worker -- $(SANDBOX_ID)
```

## 5. Configure Runtime Values

Create `../.env` with:

```bash
E2B_API_KEY="..."
E2B_ACCESS_TOKEN="..."
ANTHROPIC_API_KEY="..."
ANTHROPIC_ENVIRONMENT_ID="env_..."
ANTHROPIC_ENVIRONMENT_KEY="..."
ANTHROPIC_WEBHOOK_SIGNING_KEY="..."
```

Create the Anthropic environment in the [Anthropic Environments workspace](https://platform.claude.com/workspaces/default/environments).
Create the webhook endpoint in the [Anthropic Agents workspace](https://platform.claude.com/workspaces/default/agents)
and subscribe it to `session.status_run_started`.

## 6. Run It

```bash
npm install
make build-template
make start-app-webhook-server
```

Expose `http://localhost:8000/webhook` through your app deployment or a tunnel, then register the
public `https://.../webhook` URL with Anthropic.

Check the app server:

```bash
curl http://127.0.0.1:8000/health
```

Stop the active worker sandbox when done:

```bash
make show-environment
make stop-worker SANDBOX_ID="<e2b_worker_sandbox_id>"
```
