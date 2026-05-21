import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";
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
const MAX_WEBHOOK_BODY_BYTES = 1_048_576;
const ROUTING_SCOPES = new Set(["session", "agent", "environment"]);

class PayloadTooLargeError extends Error {}

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

function routingScope(settings: Settings) {
  const scope = settings.appSandboxRoutingScope ?? "session";
  if (!ROUTING_SCOPES.has(scope)) {
    throw new Error("APP_SANDBOX_ROUTING_SCOPE must be session, agent, or environment");
  }
  return scope;
}

async function routingTarget(settings: Settings, session: string) {
  const configuredEnvironmentId = requireSetting(
    settings.anthropicEnvironmentId,
    "ANTHROPIC_ENVIRONMENT_ID",
  );
  const scope = routingScope(settings);
  if (scope === "session") {
    return { environmentId: configuredEnvironmentId, routingScope: scope, routingId: session };
  }
  if (scope === "environment") {
    return {
      environmentId: configuredEnvironmentId,
      routingScope: scope,
      routingId: configuredEnvironmentId,
    };
  }

  const sessionInfo = await webhookClient(settings).beta.sessions.retrieve(session);
  if (sessionInfo.environment_id !== configuredEnvironmentId) {
    throw new Error(
      `session ${session} belongs to ${sessionInfo.environment_id}, but this worker is configured for ${configuredEnvironmentId}`,
    );
  }
  return {
    environmentId: sessionInfo.environment_id,
    routingScope: scope,
    routingId: sessionInfo.agent.id,
  };
}

async function ensureWorkerForEvent(settings: Settings, event: unknown) {
  const session = sessionId(event);
  const target = await routingTarget(settings, session);
  const key = `${target.routingScope}:${target.environmentId}:${target.routingId}`;
  const pending = pendingWorkers.get(key);
  if (pending) {
    return pending;
  }

  const worker = ensureWorkerForTarget(settings, target, session).finally(() => {
    pendingWorkers.delete(key);
  });
  pendingWorkers.set(key, worker);
  return worker;
}

async function ensureWorkerForTarget(
  settings: Settings,
  target: { environmentId: string; routingScope: string; routingId: string },
  session: string,
) {
  const assignment = await store.get(target);
  const sandbox = await ensureWorkerSandbox(settings, {
    sandboxId: assignment?.sandboxId,
    templateName: DEFAULT_TEMPLATE_NAME,
    timeoutSeconds: DEFAULT_SANDBOX_TIMEOUT_SECONDS,
    workerMaxIdleSeconds: DEFAULT_WORKER_MAX_IDLE_SECONDS,
    logLevel: DEFAULT_LOG_LEVEL,
  });
  await store.upsert({
    ...target,
    sessionId: session,
    sandboxId: sandbox.sandboxId,
  });
  return sandbox;
}

async function readBody(request: IncomingMessage, maxBytes: number) {
  const contentLength = request.headers["content-length"];
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new PayloadTooLargeError("request body too large");
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw new PayloadTooLargeError("request body too large");
    }
    chunks.push(buffer);
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

function hasAdminAccess(request: IncomingMessage, settings: Settings) {
  const expected = settings.appWebhookAdminToken;
  const authorization = request.headers.authorization;
  const actual = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!expected || !actual) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

async function handleWebhook(request: IncomingMessage, response: ServerResponse) {
  const settings = loadSettings();
  const signingKey = settings.anthropicWebhookSigningKey;
  if (!signingKey) {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("ANTHROPIC_WEBHOOK_SIGNING_KEY is required");
    return;
  }

  let body: string;
  try {
    body = await readBody(request, MAX_WEBHOOK_BODY_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      response.writeHead(413, { "content-type": "text/plain" });
      response.end("request body too large");
      return;
    }
    throw error;
  }

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
    if (!hasAdminAccess(request, loadSettings())) {
      response.writeHead(401, { "content-type": "text/plain" });
      response.end("unauthorized");
      return;
    }

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
