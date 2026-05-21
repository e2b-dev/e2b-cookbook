import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = dirname(fileURLToPath(import.meta.url));
export const exampleRoot = resolve(srcDir, "..");
export const repoRoot = resolve(exampleRoot, "..", "..", "..");

export type Settings = {
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

function optional(name: string) {
  return process.env[name] || undefined;
}

export function loadSettings(): Settings {
  loadDotenvFiles();
  return {
    anthropicApiKey: optional("ANTHROPIC_API_KEY"),
    anthropicAgentId: optional("ANTHROPIC_AGENT_ID"),
    anthropicEnvironmentId: optional("ANTHROPIC_ENVIRONMENT_ID"),
    anthropicEnvironmentKey: optional("ANTHROPIC_ENVIRONMENT_KEY"),
    anthropicWebhookSigningKey: optional("ANTHROPIC_WEBHOOK_SIGNING_KEY"),
    appWebhookAdminToken: optional("APP_WEBHOOK_ADMIN_TOKEN"),
    appSandboxRoutingScope: optional("APP_SANDBOX_ROUTING_SCOPE"),
  };
}

export function requireSetting(value: string | undefined, envName: string) {
  if (!value) {
    throw new Error(`missing required environment variable: ${envName}`);
  }
  return value;
}
