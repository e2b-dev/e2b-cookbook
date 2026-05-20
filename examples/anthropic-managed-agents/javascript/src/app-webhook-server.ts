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
const pendingWorkers = new Map<string, Promise<Awaited<ReturnType<typeof ensureWorkerSandbox>>>>();

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
  const key = `${environmentId}:${session}`;
  const pending = pendingWorkers.get(key);
  if (pending) {
    return pending;
  }

  const worker = ensureWorkerForSession(settings, environmentId, session).finally(() => {
    pendingWorkers.delete(key);
  });
  pendingWorkers.set(key, worker);
  return worker;
}

async function ensureWorkerForSession(settings: Settings, environmentId: string, session: string) {
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

function startWorkerInBackground(settings: Settings, event: unknown) {
  void ensureWorkerForEvent(settings, event)
    .then((sandbox) => {
      console.log(`started worker sandbox ${sandbox.sandboxId}`);
    })
    .catch((error) => {
      console.error("failed to start worker sandbox", error);
    });
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

  const client = webhookClient(settings);
  let event: ReturnType<typeof client.beta.webhooks.unwrap>;
  try {
    event = client.beta.webhooks.unwrap(body, {
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(", ") : (value ?? ""),
        ]),
      ),
      key: signingKey,
    });
  } catch (error) {
    console.error(error);
    response.writeHead(401, { "content-type": "text/plain" });
    response.end("invalid signature");
    return;
  }

  if (event.data.type === "session.status_run_started") {
    startWorkerInBackground(settings, event);
    response.writeHead(204);
    response.end();
    return;
  }

  response.writeHead(204);
  response.end();
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && request.url === "/sandboxes") {
    void store
      .list()
      .then((assignments) => writeJson(response, 200, { sandboxes: assignments }))
      .catch((error) => {
        console.error(error);
        writeJson(response, 500, { error: "failed to read sandbox store" });
      });
    return;
  }

  if (request.method === "POST" && request.url === "/webhook") {
    void handleWebhook(request, response).catch((error) => {
      console.error(error);
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "text/plain" });
      }
      response.end("webhook handler failed");
    });
    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
});

const port = Number(process.env.PORT ?? "8000");
server.listen(port, "0.0.0.0", () => {
  console.log(`app webhook server listening on ${port}`);
});
