import { resolve } from "node:path";
import { config } from "dotenv";

export const ROOT = resolve(import.meta.dirname, "..");
export const PRIVATE_DIR = resolve(ROOT, "private");
export const FIXTURES_DIR = resolve(ROOT, "fixtures", "box-workspace");
export const STATE_PATH = resolve(ROOT, ".demo-state.json");
export const RECOVERY_DIR = resolve(ROOT, "recovered");

// Synthetic files that `npm run seed` uploads, as [Box subfolder, file name].
export const SEED_FILES = [
  ["Incoming", "Kestrel-MSA.docx"],
  ["Playbook", "contract-playbook.md"],
] as const;
export const CONTRACT = SEED_FILES[0].join("/");
export const PLAYBOOK = SEED_FILES[1].join("/");
export const MEMO_NAME = "Kestrel-MSA-review.md";
export const MEMO = `Reviewed/${MEMO_NAME}`;

export type DemoConfig = {
  boxAccessToken: string;
  boxFolderId: string;
  anthropicApiKey: string;
  claudeModel: string;
};

export function loadEnv(): void {
  config({ path: resolve(ROOT, ".env"), quiet: true });
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

export function parseFolderId(value: string): string {
  if (!/^\d+$/.test(value)) {
    throw new Error("BOX_FOLDER_ID must be the number at the end of the folder URL, for example 123456789.");
  }
  return value;
}

export function getConfig(): DemoConfig {
  loadEnv();
  required("E2B_API_KEY");
  return {
    boxAccessToken: required("BOX_ACCESS_TOKEN"),
    boxFolderId: parseFolderId(required("BOX_FOLDER_ID")),
    anthropicApiKey: required("ANTHROPIC_API_KEY"),
    claudeModel: process.env.CLAUDE_MODEL?.trim() || "claude-haiku-4-5-20251001",
  };
}
