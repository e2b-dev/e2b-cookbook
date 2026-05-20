import Anthropic from "@anthropic-ai/sdk";

const CONSOLE_URL = "https://platform.claude.com/workspaces/default/environments";
export const WORKER_SANDBOX_METADATA_KEY = "e2b_worker_sandbox_id";
export const WEBHOOK_SANDBOX_METADATA_KEY = "e2b_webhook_sandbox_id";
export const WORKER_SANDBOX_STORE_METADATA_KEY = "e2b_worker_sandbox_ids";
export const WEBHOOK_SANDBOX_STORE_METADATA_KEY = "e2b_webhook_sandbox_ids";

export async function createSelfHostedEnvironment({
  apiKey,
  name,
}: {
  apiKey: string;
  name: string;
}) {
  const client = new Anthropic({ apiKey });
  return client.beta.environments.create({
    name,
    config: { type: "self_hosted" },
  });
}

export async function retrieveEnvironment({
  apiKey,
  environmentId,
}: {
  apiKey: string;
  environmentId: string;
}) {
  const client = new Anthropic({ apiKey });
  return client.beta.environments.retrieve(environmentId);
}

export async function updateEnvironmentMetadata({
  apiKey,
  environmentId,
  metadata,
}: {
  apiKey: string;
  environmentId: string;
  metadata: Record<string, string | null>;
}) {
  const client = new Anthropic({ apiKey });
  return client.beta.environments.update(environmentId, { metadata });
}

export function sandboxStore({
  metadata,
  storeKey,
  legacyKey,
}: {
  metadata: Record<string, string>;
  storeKey: string;
  legacyKey: string;
}) {
  const sandboxIds: string[] = [];
  const raw = metadata[storeKey];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        sandboxIds.push(...parsed.filter((item): item is string => typeof item === "string" && Boolean(item)));
      }
    } catch {
      // Ignore malformed metadata and fall back to the legacy key.
    }
  }

  const legacyId = metadata[legacyKey];
  if (legacyId) {
    sandboxIds.push(legacyId);
  }

  return [...new Set(sandboxIds)];
}

function serializeSandboxStore(sandboxIds: string[]) {
  return JSON.stringify([...new Set(sandboxIds)]);
}

export async function addSandboxToMetadataStore({
  apiKey,
  environmentId,
  storeKey,
  legacyKey,
  sandboxId,
}: {
  apiKey: string;
  environmentId: string;
  storeKey: string;
  legacyKey: string;
  sandboxId: string;
}) {
  const environment = await retrieveEnvironment({ apiKey, environmentId });
  const sandboxIds = sandboxStore({ metadata: environment.metadata, storeKey, legacyKey });
  return updateEnvironmentMetadata({
    apiKey,
    environmentId,
    metadata: {
      [legacyKey]: sandboxId,
      [storeKey]: serializeSandboxStore([
        sandboxId,
        ...sandboxIds.filter((item) => item !== sandboxId),
      ]),
    },
  });
}

export async function clearMatchingSandboxMetadata({
  apiKey,
  environmentId,
  sandboxId,
}: {
  apiKey: string;
  environmentId: string;
  sandboxId: string;
}) {
  const environment = await retrieveEnvironment({ apiKey, environmentId });
  const metadata: Record<string, string | null> = {};

  for (const [legacyKey, storeKey] of [
    [WORKER_SANDBOX_METADATA_KEY, WORKER_SANDBOX_STORE_METADATA_KEY],
    [WEBHOOK_SANDBOX_METADATA_KEY, WEBHOOK_SANDBOX_STORE_METADATA_KEY],
  ] as const) {
    if (environment.metadata[legacyKey] === sandboxId) {
      metadata[legacyKey] = null;
    }
    const sandboxIds = sandboxStore({ metadata: environment.metadata, storeKey, legacyKey });
    const updatedIds = sandboxIds.filter((item) => item !== sandboxId);
    if (updatedIds.length !== sandboxIds.length) {
      metadata[storeKey] = serializeSandboxStore(updatedIds);
    }
  }

  if (Object.keys(metadata).length === 0) {
    return environment;
  }

  return updateEnvironmentMetadata({ apiKey, environmentId, metadata });
}

export function consoleUrl(environmentId: string) {
  return `${CONSOLE_URL}/${environmentId}`;
}
