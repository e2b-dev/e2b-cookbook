import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Sandbox } from "e2b";

import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_SANDBOX_TIMEOUT_SECONDS,
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_WEBHOOK_PORT,
  DEFAULT_WORKER_MAX_IDLE_SECONDS,
  REMOTE_LOG,
  REMOTE_PID,
  REMOTE_SRC_DIR,
  REMOTE_TSX,
  REMOTE_WEBHOOK,
  REMOTE_WEBHOOK_LOG,
  REMOTE_WEBHOOK_PID,
  REMOTE_WORKDIR,
  REMOTE_WORKER,
} from "./constants.js";
import {
  WEBHOOK_SANDBOX_METADATA_KEY,
  WORKER_SANDBOX_METADATA_KEY,
  clearMatchingSandboxMetadata,
  updateEnvironmentMetadata,
} from "./environment.js";
import { exampleRoot, requireSetting, type Settings } from "./settings.js";

export type WorkerOptions = {
  templateName?: string;
  timeoutSeconds?: number;
  workerMaxIdleSeconds?: number | null;
  logLevel?: string;
  sandboxId?: string;
};

export type WebhookOptions = WorkerOptions & {
  port?: number;
};

async function createOrConnectWorkerSandbox(settings: Settings, options: WorkerOptions) {
  const timeoutMs = (options.timeoutSeconds ?? DEFAULT_SANDBOX_TIMEOUT_SECONDS) * 1000;
  if (options.sandboxId) {
    return Sandbox.connect(options.sandboxId, { timeoutMs });
  }

  return Sandbox.create(options.templateName ?? DEFAULT_TEMPLATE_NAME, {
    timeoutMs,
    metadata: {
      managed_by: "anthropic-managed-agents-e2b-js",
      "anthropic.environment_id": settings.anthropicEnvironmentId ?? "",
    },
  });
}

async function uploadRuntime(sandbox: Sandbox) {
  await sandbox.commands.run(`mkdir -p ${REMOTE_SRC_DIR}`, { timeoutMs: 15_000 });
  await sandbox.files.write([
    {
      path: REMOTE_WORKER,
      data: await readFile(resolve(exampleRoot, "src", "worker-runtime.ts"), "utf8"),
    },
    {
      path: REMOTE_WEBHOOK,
      data: await readFile(resolve(exampleRoot, "src", "webhook-runtime.ts"), "utf8"),
    },
  ]);
}

function workerEnv(settings: Settings, options: WorkerOptions) {
  return {
    ANTHROPIC_ENVIRONMENT_ID: requireSetting(
      settings.anthropicEnvironmentId,
      "ANTHROPIC_ENVIRONMENT_ID",
    ),
    ANTHROPIC_ENVIRONMENT_KEY: requireSetting(
      settings.anthropicEnvironmentKey,
      "ANTHROPIC_ENVIRONMENT_KEY",
    ),
    WORKER_MAX_IDLE_SECONDS:
      options.workerMaxIdleSeconds === null
        ? "none"
        : String(options.workerMaxIdleSeconds ?? DEFAULT_WORKER_MAX_IDLE_SECONDS),
    LOG_LEVEL: (options.logLevel ?? DEFAULT_LOG_LEVEL).toUpperCase(),
  };
}

export async function startWorkerSandbox(settings: Settings, options: WorkerOptions = {}) {
  requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID");
  requireSetting(settings.anthropicEnvironmentKey, "ANTHROPIC_ENVIRONMENT_KEY");

  const sandbox = await createOrConnectWorkerSandbox(settings, options);
  await uploadRuntime(sandbox);
  const handle = await sandbox.commands.run(`bash -lc ${JSON.stringify(`exec ${REMOTE_TSX} ${REMOTE_WORKER} >> ${REMOTE_LOG} 2>&1`)}`, {
    background: true,
    cwd: REMOTE_WORKDIR,
    envs: workerEnv(settings, options),
  });
  await sandbox.files.write(REMOTE_PID, `${handle.pid}\n`);
  await handle.disconnect();
  if (settings.anthropicApiKey) {
    await updateEnvironmentMetadata({
      apiKey: settings.anthropicApiKey,
      environmentId: requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID"),
      metadata: { [WORKER_SANDBOX_METADATA_KEY]: sandbox.sandboxId },
    });
  }

  return sandbox;
}

export async function startWebhookServerSandbox(settings: Settings, options: WebhookOptions = {}) {
  requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID");
  requireSetting(settings.anthropicEnvironmentKey, "ANTHROPIC_ENVIRONMENT_KEY");

  const timeoutMs = (options.timeoutSeconds ?? DEFAULT_SANDBOX_TIMEOUT_SECONDS) * 1000;
  const sandbox = options.sandboxId
    ? await Sandbox.connect(options.sandboxId, { timeoutMs })
    : await Sandbox.create(options.templateName ?? DEFAULT_TEMPLATE_NAME, {
        timeoutMs,
        lifecycle: { onTimeout: "pause", autoResume: true },
        metadata: {
          managed_by: "anthropic-managed-agents-e2b-js-webhook",
          "anthropic.environment_id": settings.anthropicEnvironmentId ?? "",
        },
      });

  await uploadRuntime(sandbox);
  const envs: Record<string, string> = {
    ...workerEnv(settings, options),
    WEBHOOK_PORT: String(options.port ?? DEFAULT_WEBHOOK_PORT),
  };
  if (settings.anthropicWebhookSigningKey) {
    envs.ANTHROPIC_WEBHOOK_SIGNING_KEY = settings.anthropicWebhookSigningKey;
  }

  const handle = await sandbox.commands.run(
    `bash -lc ${JSON.stringify(`exec ${REMOTE_TSX} ${REMOTE_WEBHOOK} >> ${REMOTE_WEBHOOK_LOG} 2>&1`)}`,
    {
      background: true,
      cwd: REMOTE_WORKDIR,
      envs,
    },
  );
  await sandbox.files.write(REMOTE_WEBHOOK_PID, `${handle.pid}\n`);
  await handle.disconnect();
  if (settings.anthropicApiKey) {
    await updateEnvironmentMetadata({
      apiKey: settings.anthropicApiKey,
      environmentId: requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID"),
      metadata: { [WEBHOOK_SANDBOX_METADATA_KEY]: sandbox.sandboxId },
    });
  }

  const result = await sandbox.commands.run("true", {
    envs,
    timeoutMs: 5_000,
  });

  if (result.exitCode !== 0) {
    throw new Error(`webhook server start failed:\n${result.stdout}\n${result.stderr}`);
  }

  return sandbox;
}

export async function stopWorkerSandbox(settings: Settings, sandboxId: string) {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.kill();
  if (settings.anthropicApiKey && settings.anthropicEnvironmentId) {
    await clearMatchingSandboxMetadata({
      apiKey: settings.anthropicApiKey,
      environmentId: settings.anthropicEnvironmentId,
      sandboxId,
    });
  }
}

export async function uploadFileToSandbox({
  sandboxId,
  localPath,
  remotePath,
}: {
  sandboxId: string;
  localPath: string;
  remotePath: string;
}) {
  const sandbox = await Sandbox.connect(sandboxId);
  const data = await readFile(localPath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  await sandbox.files.write(remotePath, arrayBuffer);
  return remotePath;
}
