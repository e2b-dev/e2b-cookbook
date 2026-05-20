import Anthropic from "@anthropic-ai/sdk";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_SANDBOX_TIMEOUT_SECONDS,
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_WORKER_MAX_IDLE_SECONDS,
} from "./constants.js";
import { WORKER_SANDBOX_METADATA_KEY, retrieveEnvironment } from "./environment.js";
import { ensureWorkerSandbox } from "./sandbox-worker.js";
import { loadSettings, requireSetting, type Settings } from "./settings.js";

function webhookClient(settings: Settings) {
  return new Anthropic({
    apiKey: requireSetting(settings.anthropicApiKey, "ANTHROPIC_API_KEY"),
  });
}

async function currentWorkerSandboxId(settings: Settings) {
  const environment = await retrieveEnvironment({
    apiKey: requireSetting(settings.anthropicApiKey, "ANTHROPIC_API_KEY"),
    environmentId: requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID"),
  });
  return environment.metadata[WORKER_SANDBOX_METADATA_KEY];
}

async function ensureWorkerForEvent(settings: Settings) {
  return ensureWorkerSandbox(settings, {
    sandboxId: await currentWorkerSandboxId(settings),
    templateName: DEFAULT_TEMPLATE_NAME,
    timeoutSeconds: DEFAULT_SANDBOX_TIMEOUT_SECONDS,
    workerMaxIdleSeconds: DEFAULT_WORKER_MAX_IDLE_SECONDS,
    logLevel: DEFAULT_LOG_LEVEL,
  });
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
      const sandbox = await ensureWorkerForEvent(settings);
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
