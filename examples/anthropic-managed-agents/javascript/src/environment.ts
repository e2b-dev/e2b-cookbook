import Anthropic from "@anthropic-ai/sdk";

const CONSOLE_URL = "https://platform.claude.com/workspaces/default/environments";

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

export function consoleUrl(environmentId: string) {
  return `${CONSOLE_URL}/${environmentId}`;
}
