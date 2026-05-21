export const DEFAULT_TEMPLATE_NAME = "claude-managed-agents-webhooks";
export const DEFAULT_WORKER_MAX_IDLE_SECONDS = 300;
export const DEFAULT_SANDBOX_TIMEOUT_SECONDS = 3600;
export const DEFAULT_WEBHOOK_PORT = 8000;
export const DEFAULT_LOG_LEVEL = "INFO";

export const REMOTE_DIR = "/opt/anthropic-managed-agents-js";
export const REMOTE_SRC_DIR = `${REMOTE_DIR}/src`;
export const REMOTE_WORKDIR = "/mnt/session";
export const REMOTE_WORKER = `${REMOTE_SRC_DIR}/worker-runtime.ts`;
export const REMOTE_WEBHOOK = `${REMOTE_SRC_DIR}/webhook-runtime.ts`;
export const REMOTE_PID = `${REMOTE_DIR}/worker.pid`;
export const REMOTE_LOG = `${REMOTE_DIR}/worker.log`;
export const REMOTE_WEBHOOK_PID = `${REMOTE_DIR}/webhook.pid`;
export const REMOTE_WEBHOOK_LOG = `${REMOTE_DIR}/webhook.log`;
export const REMOTE_TSX = `${REMOTE_DIR}/node_modules/.bin/tsx`;
export const REMOTE_ENVIRONMENT_ID = `${REMOTE_WORKDIR}/.anthropic-environment-id`;
export const REMOTE_ENVIRONMENT_KEY = `${REMOTE_WORKDIR}/.anthropic-environment-key`;
export const REMOTE_WEBHOOK_SIGNING_KEY = `${REMOTE_WORKDIR}/.anthropic-webhook-signing-key`;
export const REMOTE_WORKER_MAX_IDLE_SECONDS = `${REMOTE_WORKDIR}/.worker-max-idle-seconds`;
export const REMOTE_LOG_LEVEL = `${REMOTE_WORKDIR}/.log-level`;

export const SANDBOX_TOOLS = ["bash", "read", "write", "edit", "glob", "grep"] as const;
export const WEB_TOOLS = ["web_fetch", "web_search"] as const;
export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const DEFAULT_SYSTEM_PROMPT =
  "You have a Linux sandbox. Use /mnt/session as the working directory. " +
  "Agent skills are downloaded under /mnt/session/skills/<name>/. " +
  "Write generated artifacts under /mnt/session/outputs when useful. " +
  "Use the available tools to complete the task.";
