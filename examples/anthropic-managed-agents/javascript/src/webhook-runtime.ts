import Anthropic from "@anthropic-ai/sdk";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { spawn } from "node:child_process";

const REMOTE_DIR = "/opt/anthropic-managed-agents-js";
const REMOTE_WORKDIR = "/mnt/session";
const REMOTE_TSX = `${REMOTE_DIR}/node_modules/.bin/tsx`;
const REMOTE_WORKER = `${REMOTE_DIR}/src/worker-runtime.ts`;
const REMOTE_PID = `${REMOTE_DIR}/worker.pid`;
const REMOTE_LOG = `${REMOTE_DIR}/worker.log`;
const REMOTE_WEBHOOK_SIGNING_KEY = `${REMOTE_WORKDIR}/.anthropic-webhook-signing-key`;
const MAX_WEBHOOK_BODY_BYTES = 1_048_576;

const client = new Anthropic({ apiKey: "not-needed" });

class PayloadTooLargeError extends Error {}

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
  if (!existsSync(REMOTE_PID)) {
    return false;
  }

  const pid = Number(readFileSync(REMOTE_PID, "utf8").trim());
  return Number.isInteger(pid) && existsSync(`/proc/${pid}`);
}

function startWorkerIfNeeded() {
  if (workerIsRunning()) {
    return;
  }

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

function webhookSigningKey() {
  if (process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY) {
    return process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY;
  }

  const keyPath = process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY_FILE ?? REMOTE_WEBHOOK_SIGNING_KEY;
  if (existsSync(keyPath)) {
    return readFileSync(keyPath, "utf8").trim();
  }

  return undefined;
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

async function handleWebhook(request: IncomingMessage, response: ServerResponse) {
  const signingKey = webhookSigningKey();
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
    writeJson(response, 200, { ok: true, worker_running: workerIsRunning() });
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

const port = Number(process.env.WEBHOOK_PORT ?? "8000");
server.listen(port, "0.0.0.0", () => {
  console.log(`webhook server listening on ${port}`);
});
