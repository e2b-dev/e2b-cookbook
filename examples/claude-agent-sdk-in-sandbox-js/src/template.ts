import { Template } from "e2b";

export const templateName = "claude-agent-sdk";

export const template = Template()
  .fromNodeImage("24")
  .setWorkdir("/agent")
  .runCmd("npm init -y && npm install @anthropic-ai/claude-agent-sdk")
  .runCmd("mkdir -p /agent/workspace");
