import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Sandbox } from "e2b";

import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_SANDBOX_TIMEOUT_SECONDS,
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_WEBHOOK_PORT,
  DEFAULT_WORKER_MAX_IDLE_SECONDS,
  REMOTE_ANTHROPIC_API_KEY,
  REMOTE_APP_SANDBOX_ROUTING_SCOPE,
  REMOTE_APP_WEBHOOK_ADMIN_TOKEN,
  REMOTE_CONFIG_DIR,
  REMOTE_E2B_API_KEY,
  REMOTE_ENVIRONMENT_ID,
  REMOTE_ENVIRONMENT_KEY,
  REMOTE_LOG_LEVEL,
  REMOTE_LOG,
  REMOTE_PID,
  REMOTE_SRC_DIR,
  REMOTE_TSX,
  REMOTE_WEBHOOK,
  REMOTE_WEBHOOK_LOG,
  REMOTE_WEBHOOK_PID,
  REMOTE_WEBHOOK_SIGNING_KEY,
  REMOTE_WORKER_MAX_IDLE_SECONDS,
  REMOTE_WORKDIR,
  REMOTE_WORKER,
} from "./constants.js";
import {
  WEBHOOK_SANDBOX_METADATA_KEY,
  WEBHOOK_SANDBOX_STORE_METADATA_KEY,
  WORKER_SANDBOX_METADATA_KEY,
  WORKER_SANDBOX_STORE_METADATA_KEY,
  addSandboxToMetadataStore,
  clearMatchingSandboxMetadata,
} from "./environment.js";
import { JsonSandboxStore } from "./app-sandbox-store.js";
import { exampleRoot, requireSetting, type Settings } from "./settings.js";

export type WorkerOptions = {
  templateName?: string;
  timeoutSeconds?: number;
  workerMaxIdleSeconds?: number | null;
  logLevel?: string;
  sandboxId?: string;
  sandboxIds?: string[];
  workId?: string;
  sessionId?: string;
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
    lifecycle: { onTimeout: "pause", autoResume: true },
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
    ...(options.workId ? { ANTHROPIC_WORK_ID: options.workId } : {}),
    ...(options.sessionId ? { ANTHROPIC_SESSION_ID: options.sessionId } : {}),
  };
}

export async function workerProcessIsRunning(sandbox: Sandbox) {
  const check =
    `test -f ${REMOTE_PID} && ` +
    `pid="$(cat ${REMOTE_PID})" && ` +
    `test -n "$pid" && ` +
    `kill -0 "$pid"`;
  try {
    const result = await sandbox.commands.run(`bash -lc ${JSON.stringify(check)}`, {
      timeoutMs: 5_000,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function ensureWorkerProcess(
  sandbox: Sandbox,
  settings: Settings,
  options: WorkerOptions = {},
) {
  await uploadRuntime(sandbox);
  const handlesClaimedWork = Boolean(options.workId || options.sessionId);
  if (!handlesClaimedWork && await workerProcessIsRunning(sandbox)) {
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

export async function startWorkerSandbox(settings: Settings, options: WorkerOptions = {}) {
  requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID");
  requireSetting(settings.anthropicEnvironmentKey, "ANTHROPIC_ENVIRONMENT_KEY");

  const sandbox = await createOrConnectWorkerSandbox(settings, options);
  await ensureWorkerProcess(sandbox, settings, options);
  if (settings.anthropicApiKey) {
    await addSandboxToMetadataStore({
      apiKey: settings.anthropicApiKey,
      environmentId: requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID"),
      legacyKey: WORKER_SANDBOX_METADATA_KEY,
      storeKey: WORKER_SANDBOX_STORE_METADATA_KEY,
      sandboxId: sandbox.sandboxId,
    });
  }

  return sandbox;
}

export async function ensureWorkerSandbox(settings: Settings, options: WorkerOptions = {}) {
  const candidateIds = [
    ...new Set([...(options.sandboxIds ?? []), options.sandboxId].filter((item): item is string => Boolean(item))),
  ];
  for (const candidateId of candidateIds) {
    try {
      return await startWorkerSandbox(settings, { ...options, sandboxId: candidateId });
    } catch (error) {
      console.warn(`failed to connect worker sandbox ${candidateId}; trying next candidate`, error);
    }
  }

  try {
    return await startWorkerSandbox(settings, options);
  } catch (error) {
    if (!options.sandboxId) {
      throw error;
    }
    console.warn(`failed to connect worker sandbox ${options.sandboxId}; creating a replacement`, error);
    return startWorkerSandbox(settings, { ...options, sandboxId: undefined });
  }
}

export async function startWebhookServerSandbox(settings: Settings, options: WebhookOptions = {}) {
  requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID");
  requireSetting(settings.anthropicEnvironmentKey, "ANTHROPIC_ENVIRONMENT_KEY");

  const timeoutMs = (options.timeoutSeconds ?? DEFAULT_SANDBOX_TIMEOUT_SECONDS) * 1000;
  const sandbox = options.sandboxId
    ? await Sandbox.connect(options.sandboxId, { timeoutMs })
    : await Sandbox.create(options.templateName ?? DEFAULT_TEMPLATE_NAME, {
        timeoutMs,
        envs: {
          ...workerEnv(settings, options),
          WEBHOOK_PORT: String(options.port ?? DEFAULT_WEBHOOK_PORT),
          ...(settings.anthropicWebhookSigningKey
            ? { ANTHROPIC_WEBHOOK_SIGNING_KEY: settings.anthropicWebhookSigningKey }
            : {}),
        },
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
  await sandbox.commands.run(`mkdir -p ${REMOTE_CONFIG_DIR} && chmod 700 ${REMOTE_CONFIG_DIR}`, {
    timeoutMs: 5_000,
  });
  await sandbox.files.write([
    ...(settings.e2bApiKey ? [{ path: REMOTE_E2B_API_KEY, data: `${settings.e2bApiKey}\n` }] : []),
    ...(settings.anthropicApiKey
      ? [{ path: REMOTE_ANTHROPIC_API_KEY, data: `${settings.anthropicApiKey}\n` }]
      : []),
    { path: REMOTE_ENVIRONMENT_ID, data: `${envs.ANTHROPIC_ENVIRONMENT_ID}\n` },
    { path: REMOTE_ENVIRONMENT_KEY, data: `${envs.ANTHROPIC_ENVIRONMENT_KEY}\n` },
    {
      path: REMOTE_WORKER_MAX_IDLE_SECONDS,
      data: `${envs.WORKER_MAX_IDLE_SECONDS ?? DEFAULT_WORKER_MAX_IDLE_SECONDS}\n`,
    },
    { path: REMOTE_LOG_LEVEL, data: `${envs.LOG_LEVEL ?? DEFAULT_LOG_LEVEL}\n` },
    ...(settings.anthropicWebhookSigningKey
      ? [{ path: REMOTE_WEBHOOK_SIGNING_KEY, data: `${settings.anthropicWebhookSigningKey}\n` }]
      : []),
    ...(settings.appWebhookAdminToken
      ? [{ path: REMOTE_APP_WEBHOOK_ADMIN_TOKEN, data: `${settings.appWebhookAdminToken}\n` }]
      : []),
    ...(settings.appSandboxRoutingScope
      ? [{ path: REMOTE_APP_SANDBOX_ROUTING_SCOPE, data: `${settings.appSandboxRoutingScope}\n` }]
      : []),
  ]);
  await sandbox.commands.run(`chmod 600 ${REMOTE_CONFIG_DIR}/*`, { timeoutMs: 5_000 });

  const healthUrl = `http://127.0.0.1:${options.port ?? DEFAULT_WEBHOOK_PORT}/health`;
  let webhookServerReady = false;
  try {
    await sandbox.commands.run(`curl --fail --silent --show-error ${healthUrl}`, {
      timeoutMs: 5_000,
    });
    webhookServerReady = true;
  } catch {
    // Older/local templates do not have a start command; start the server below.
  }

  if (!webhookServerReady) {
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
  }

  if (settings.anthropicApiKey) {
    await addSandboxToMetadataStore({
      apiKey: settings.anthropicApiKey,
      environmentId: requireSetting(settings.anthropicEnvironmentId, "ANTHROPIC_ENVIRONMENT_ID"),
      legacyKey: WEBHOOK_SANDBOX_METADATA_KEY,
      storeKey: WEBHOOK_SANDBOX_STORE_METADATA_KEY,
      sandboxId: sandbox.sandboxId,
    });
  }

  if (webhookServerReady) {
    return sandbox;
  }

  const attempts = Array.from({ length: 30 }, (_, index) => index + 1).join(" ");
  const healthCheck =
    `for i in ${attempts}; do ` +
    `curl --fail --silent --show-error ${healthUrl} && exit 0; ` +
    `sleep 1; ` +
    `done; ` +
    `echo "webhook log:" >&2; ` +
    `tail -100 ${REMOTE_WEBHOOK_LOG} >&2 || true; ` +
    `exit 1`;
  try {
    await sandbox.commands.run(`bash -lc ${JSON.stringify(healthCheck)}`, {
      timeoutMs: 35_000,
    });
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string };
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const message = output || (error instanceof Error ? error.message : String(error));
    throw new Error(`webhook server health check failed: ${healthUrl}\n${message}`);
  }

  return sandbox;
}

export async function stopWorkerSandbox(settings: Settings, sandboxId: string) {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.kill();
  await new JsonSandboxStore().removeSandbox(sandboxId);
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
