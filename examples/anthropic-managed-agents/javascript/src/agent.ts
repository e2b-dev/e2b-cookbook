import Anthropic from "@anthropic-ai/sdk";

import {
  DEFAULT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  SANDBOX_TOOLS,
  WEB_TOOLS,
} from "./constants.js";

type SandboxTool = (typeof SANDBOX_TOOLS)[number];
type WebTool = (typeof WEB_TOOLS)[number];
type ManagedAgentTool = SandboxTool | WebTool;

export async function createAgent({
  apiKey,
  name,
  model = DEFAULT_MODEL,
  sandboxTools = SANDBOX_TOOLS,
  webTools = WEB_TOOLS,
}: {
  apiKey: string;
  name: string;
  model?: string;
  sandboxTools?: readonly SandboxTool[];
  webTools?: readonly WebTool[];
}) {
  const client = new Anthropic({ apiKey });
  const enabledTools: ManagedAgentTool[] = [...sandboxTools, ...webTools];
  return client.beta.agents.create({
    name,
    model,
    system: DEFAULT_SYSTEM_PROMPT,
    tools: [
      {
        type: "agent_toolset_20260401",
        default_config: {
          enabled: false,
          permission_policy: { type: "always_allow" },
        },
        configs: enabledTools.map((tool) => ({
          name: tool,
          enabled: true,
          permission_policy: { type: "always_allow" },
        })),
      },
    ],
  });
}
