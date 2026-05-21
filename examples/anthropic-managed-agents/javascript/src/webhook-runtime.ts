import Anthropic from "@anthropic-ai/sdk";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";

const REMOTE_DIR = "/opt/anthropic-managed-agents-js";
const REMOTE_WORKDIR = "/mnt/session";
const REMOTE_TSX = `${REMOTE_DIR}/node_modules/.bin/tsx`;
const REMOTE_WORKER = `${REMOTE_DIR}/src/worker-runtime.ts`;
const REMOTE_PID = `${REMOTE_DIR}/worker.pid`;
const REMOTE_PIDS_DIR = `${REMOTE_DIR}/worker-pids`;
const REMOTE_LOG = `${REMOTE_DIR}/worker.log`;
const REMOTE_ENVIRONMENT_ID = `${REMOTE_WORKDIR}/.anthropic-environment-id`;
const REMOTE_ENVIRONMENT_KEY = `${REMOTE_WORKDIR}/.anthropic-environment-key`;
const REMOTE_WEBHOOK_SIGNING_KEY = `${REMOTE_WORKDIR}/.anthropic-webhook-signing-key`;
const REMOTE_WORKER_MAX_IDLE_SECONDS = `${REMOTE_WORKDIR}/.worker-max-idle-seconds`;
const REMOTE_LOG_LEVEL = `${REMOTE_WORKDIR}/.log-level`;
const MAX_WEBHOOK_BODY_BYTES = 1_048_576;
const MAX_WORKERS = Number(process.env.MAX_WORKERS ?? "4");
const WORKER_RETRY_MS = 5_000;

const client = new Anthropic({ apiKey: "not-needed" });
let pendingWorkerStarts = 0;
let workerRetryTimer: NodeJS.Timeout | undefined;

class PayloadTooLargeError extends Error {}

function fileValue(path: string) {
  if (!existsSync(path)) {
    return undefined;
  }
  const value = readFileSync(path, "utf8").trim();
  return value || undefined;
}

function configValue(name: string, path: string) {
  return process.env[name] || fileValue(path);
}

function workerEnv() {
  return {
    ANTHROPIC_ENVIRONMENT_ID: configValue("ANTHROPIC_ENVIRONMENT_ID", REMOTE_ENVIRONMENT_ID),
    ANTHROPIC_ENVIRONMENT_KEY: configValue("ANTHROPIC_ENVIRONMENT_KEY", REMOTE_ENVIRONMENT_KEY),
    WORKER_MAX_IDLE_SECONDS: configValue("WORKER_MAX_IDLE_SECONDS", REMOTE_WORKER_MAX_IDLE_SECONDS),
    WORKER_RUN_SECONDS: process.env.WORKER_RUN_SECONDS,
    LOG_LEVEL: configValue("LOG_LEVEL", REMOTE_LOG_LEVEL),
    PATH: process.env.PATH,
    HOME: process.env.HOME,
  };
}

function processIsRunning(pid: number) {
  return Number.isInteger(pid) && existsSync(`/proc/${pid}`);
}

function activeWorkerPids() {
  mkdirSync(REMOTE_PIDS_DIR, { recursive: true });
  const pids: number[] = [];

  for (const file of readdirSync(REMOTE_PIDS_DIR)) {
    const path = `${REMOTE_PIDS_DIR}/${file}`;
    const pid = Number(readFileSync(path, "utf8").trim());
    if (processIsRunning(pid)) {
      pids.push(pid);
    } else {
      unlinkSync(path);
    }
  }

  if (existsSync(REMOTE_PID)) {
    const pid = Number(readFileSync(REMOTE_PID, "utf8").trim());
    if (processIsRunning(pid) && !pids.includes(pid)) {
      pids.push(pid);
    }
  }

  return pids;
}

function scheduleWorkerRetry() {
  if (workerRetryTimer || pendingWorkerStarts === 0) {
    return;
  }

  workerRetryTimer = setTimeout(() => {
    workerRetryTimer = undefined;
    startWorkerIfCapacity({ retryingPendingStart: true });
  }, WORKER_RETRY_MS);
}

function startWorkerIfCapacity({ retryingPendingStart = false } = {}) {
  const pids = activeWorkerPids();
  if (pids.length >= MAX_WORKERS) {
    if (!retryingPendingStart) {
      pendingWorkerStarts = Math.min(pendingWorkerStarts + 1, MAX_WORKERS);
    }
    scheduleWorkerRetry();
    return;
  }

  if (retryingPendingStart) {
    pendingWorkerStarts = Math.max(0, pendingWorkerStarts - 1);
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
  writeFileSync(`${REMOTE_PIDS_DIR}/${child.pid}.pid`, `${child.pid}\n`);
  child.on("exit", () => {
    try {
      unlinkSync(`${REMOTE_PIDS_DIR}/${child.pid}.pid`);
    } catch {
      // The health check can clean stale pid files too.
    }
    scheduleWorkerRetry();
  });
}

function webhookSigningKey() {
  const keyPath = process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY_FILE ?? REMOTE_WEBHOOK_SIGNING_KEY;
  return configValue("ANTHROPIC_WEBHOOK_SIGNING_KEY", keyPath);
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
      startWorkerIfCapacity();
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
    const pids = activeWorkerPids();
    writeJson(response, 200, { ok: true, worker_running: pids.length > 0, worker_count: pids.length });
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
