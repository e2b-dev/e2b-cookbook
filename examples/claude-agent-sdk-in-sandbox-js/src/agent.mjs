// This script runs INSIDE the E2B sandbox.
// It drives the Claude Agent SDK and streams every message to stdout as one
// JSON object per line, so the host process can render progress in real time.
import { query } from "@anthropic-ai/claude-agent-sdk";

const prompt = process.env.AGENT_PROMPT;

if (!prompt) {
  console.error("AGENT_PROMPT environment variable is not set");
  process.exit(1);
}

for await (const message of query({
  prompt,
  options: {
    cwd: "/agent/workspace",
    // The sandbox is the security boundary here, so the agent can run fully
    // autonomously without permission prompts: everything it does is
    // isolated inside the E2B sandbox, not on your machine.
    permissionMode: "bypassPermissions",
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch"],
  },
})) {
  console.log(JSON.stringify(message));
}
