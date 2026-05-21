import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { exampleRoot } from "./settings.js";

export type SandboxAssignment = {
  environmentId: string;
  routingScope: string;
  routingId: string;
  sessionId: string;
  sandboxId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function now() {
  return new Date().toISOString();
}

function storePath() {
  return process.env.APP_SANDBOX_STORE_PATH ?? resolve(exampleRoot, ".managed-agent-sandbox-store.json");
}

export class JsonSandboxStore {
  constructor(private readonly path = storePath()) {}

  async list() {
    return this.read();
  }

  async get({
    environmentId,
    routingScope,
    routingId,
  }: {
    environmentId: string;
    routingScope: string;
    routingId: string;
  }) {
    const assignments = await this.read();
    return assignments.find(
      (item) =>
        item.environmentId === environmentId &&
        item.routingScope === routingScope &&
        item.routingId === routingId,
    );
  }

  async upsert({
    environmentId,
    routingScope,
    routingId,
    sessionId,
    sandboxId,
    status = "active",
  }: {
    environmentId: string;
    routingScope: string;
    routingId: string;
    sessionId: string;
    sandboxId: string;
    status?: string;
  }) {
    const assignments = await this.read();
    const existing = assignments.find(
      (item) =>
        item.environmentId === environmentId &&
        item.routingScope === routingScope &&
        item.routingId === routingId,
    );
    const timestamp = now();
    const assignment: SandboxAssignment = {
      environmentId,
      routingScope,
      routingId,
      sessionId,
      sandboxId,
      status,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await this.write([
      ...assignments.filter(
        (item) =>
          !(
            item.environmentId === environmentId &&
            item.routingScope === routingScope &&
            item.routingId === routingId
          ),
      ),
      assignment,
    ]);
    return assignment;
  }

  async removeSandbox(sandboxId: string) {
    const assignments = await this.read();
    await this.write(assignments.filter((item) => item.sandboxId !== sandboxId));
  }

  private async read(): Promise<SandboxAssignment[]> {
    try {
      const text = await readFile(this.path, "utf8");
      if (!text.trim()) {
        return [];
      }
      const raw = JSON.parse(text);
      if (!Array.isArray(raw)) {
        return [];
      }
      return raw
        .filter(
          (item) =>
            item &&
            typeof item === "object" &&
            item.environmentId &&
            item.sessionId &&
            item.sandboxId &&
            item.createdAt &&
            item.updatedAt,
        )
        .map((item) => ({
          environmentId: String(item.environmentId),
          routingScope: String(item.routingScope ?? "session"),
          routingId: String(item.routingId ?? item.sessionId),
          sessionId: String(item.sessionId),
          sandboxId: String(item.sandboxId),
          status: String(item.status ?? "active"),
          createdAt: String(item.createdAt),
          updatedAt: String(item.updatedAt),
        }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async write(assignments: SandboxAssignment[]) {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(assignments, null, 2)}\n`);
  }
}
