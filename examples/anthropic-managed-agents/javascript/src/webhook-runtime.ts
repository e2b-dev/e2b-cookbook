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

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "not-needed" });

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
    env: process.env,
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

function writeJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
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
    response.writeHead(400, { "content-type": "text/plain" });
    response.end("invalid signature");
  }
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, { ok: true, worker_running: workerIsRunning() });
    return;
  }

  if (request.method === "POST" && request.url === "/webhook") {
    void handleWebhook(request, response);
    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
});

const port = Number(process.env.WEBHOOK_PORT ?? "8000");
server.listen(port, "0.0.0.0", () => {
  console.log(`webhook server listening on ${port}`);
});
