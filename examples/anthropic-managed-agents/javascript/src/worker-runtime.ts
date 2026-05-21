import Anthropic from "@anthropic-ai/sdk";
import { type LogLevel } from "@anthropic-ai/sdk/client";

const WORKDIR = "/mnt/session";
const LOG_LEVELS = new Set(["off", "error", "warn", "info", "debug"]);

function maxIdleMs() {
  const raw = process.env.WORKER_MAX_IDLE_SECONDS ?? "30";
  if (["", "none", "null"].includes(raw.toLowerCase())) {
    return undefined;
  }
  return Number(raw) * 1000;
}

function runMs() {
  const raw = process.env.WORKER_RUN_SECONDS ?? "180";
  if (["", "none", "null"].includes(raw.toLowerCase())) {
    return undefined;
  }
  return Number(raw) * 1000;
}

function logLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return (LOG_LEVELS.has(raw) ? raw : "info") as LogLevel;
}

async function main() {
  const environmentId = process.env.ANTHROPIC_ENVIRONMENT_ID;
  const environmentKey = process.env.ANTHROPIC_ENVIRONMENT_KEY;

  if (!environmentId) {
    throw new Error("ANTHROPIC_ENVIRONMENT_ID is required");
  }
  if (!environmentKey) {
    throw new Error("ANTHROPIC_ENVIRONMENT_KEY is required");
  }

  const client = new Anthropic({
    authToken: environmentKey,
    logger: console,
    logLevel: logLevel(),
  });
  const controller = new AbortController();
  const maxRunMs = runMs();
  const timer =
    maxRunMs === undefined ? undefined : setTimeout(() => controller.abort(), maxRunMs);

  try {
    const worker = client.beta.environments.work.worker({
      environmentId,
      environmentKey,
      workdir: WORKDIR,
      maxIdleMs: maxIdleMs(),
      signal: controller.signal,
    });
    if (process.env.ANTHROPIC_WORK_ID || process.env.ANTHROPIC_SESSION_ID) {
      await worker.handleItem({
        workId: process.env.ANTHROPIC_WORK_ID,
        environmentId,
        sessionId: process.env.ANTHROPIC_SESSION_ID,
        environmentKey,
        signal: controller.signal,
      });
    } else {
      await worker.run();
    }
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
