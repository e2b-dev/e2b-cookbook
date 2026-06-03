import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REMOTE_ANTHROPIC_API_KEY,
  REMOTE_APP_SANDBOX_ROUTING_SCOPE,
  REMOTE_APP_WEBHOOK_ADMIN_TOKEN,
  REMOTE_E2B_API_KEY,
  REMOTE_ENVIRONMENT_ID,
  REMOTE_ENVIRONMENT_KEY,
  REMOTE_WEBHOOK_SIGNING_KEY,
} from "./constants.js";

const srcDir = dirname(fileURLToPath(import.meta.url));
export const exampleRoot = resolve(srcDir, "..");
export const repoRoot = resolve(exampleRoot, "..", "..", "..");

export type Settings = {
  e2bApiKey?: string;
  anthropicApiKey?: string;
  anthropicAgentId?: string;
  anthropicEnvironmentId?: string;
  anthropicEnvironmentKey?: string;
  anthropicWebhookSigningKey?: string;
  appWebhookAdminToken?: string;
  appSandboxRoutingScope?: string;
};

export function loadDotenvFiles() {
  config({ path: resolve(repoRoot, ".env"), override: false, quiet: true });
  config({ path: resolve(exampleRoot, ".env"), override: true, quiet: true });
}

function fileValue(path: string) {
  if (!existsSync(path)) {
    return undefined;
  }
  const value = readFileSync(path, "utf8").trim();
  return value || undefined;
}

function optional(name: string, filePath?: string) {
  return process.env[name] || (filePath ? fileValue(filePath) : undefined);
}

export function loadSettings(): Settings {
  loadDotenvFiles();
  const e2bApiKey = optional("E2B_API_KEY", REMOTE_E2B_API_KEY);
  if (e2bApiKey && !process.env.E2B_API_KEY) {
    process.env.E2B_API_KEY = e2bApiKey;
  }
  return {
    e2bApiKey,
    anthropicApiKey: optional("ANTHROPIC_API_KEY", REMOTE_ANTHROPIC_API_KEY),
    anthropicAgentId: optional("ANTHROPIC_AGENT_ID"),
    anthropicEnvironmentId: optional("ANTHROPIC_ENVIRONMENT_ID", REMOTE_ENVIRONMENT_ID),
    anthropicEnvironmentKey: optional("ANTHROPIC_ENVIRONMENT_KEY", REMOTE_ENVIRONMENT_KEY),
    anthropicWebhookSigningKey: optional("ANTHROPIC_WEBHOOK_SIGNING_KEY", REMOTE_WEBHOOK_SIGNING_KEY),
    appWebhookAdminToken: optional("APP_WEBHOOK_ADMIN_TOKEN", REMOTE_APP_WEBHOOK_ADMIN_TOKEN),
    appSandboxRoutingScope: optional("APP_SANDBOX_ROUTING_SCOPE", REMOTE_APP_SANDBOX_ROUTING_SCOPE),
  };
}

export function requireSetting(value: string | undefined, envName: string) {
  if (!value) {
    throw new Error(`missing required environment variable: ${envName}`);
  }
  return value;
}
