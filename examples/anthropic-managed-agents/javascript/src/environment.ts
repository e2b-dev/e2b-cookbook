import Anthropic from "@anthropic-ai/sdk";

const CONSOLE_URL = "https://platform.claude.com/workspaces/default/environments";
export const WORKER_SANDBOX_METADATA_KEY = "e2b_worker_sandbox_id";
export const WEBHOOK_SANDBOX_METADATA_KEY = "e2b_webhook_sandbox_id";

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

  for (const key of [WORKER_SANDBOX_METADATA_KEY, WEBHOOK_SANDBOX_METADATA_KEY]) {
    if (environment.metadata[key] === sandboxId) {
      metadata[key] = null;
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
