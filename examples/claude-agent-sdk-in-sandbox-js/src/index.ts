import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Sandbox } from "e2b";
import { templateName } from "./template";

dotenv.config();

const PROMPT =
  "Create a self-contained index.html (single file, inline CSS and JS, no external dependencies) " +
  "that trains a tiny neural network in the browser on the XOR problem and draws its decision " +
  "boundary on a canvas while it trains. Keep it under 300 lines. " +
  "Save it as index.html in your current working directory and don't copy it anywhere else.";

const OUTPUT_DIR = "./output";

// The Agent SDK accepts either an Anthropic API key or a Claude
// subscription token generated with `claude setup-token`
function agentCredentials(): Record<string, string> {
  if (process.env.ANTHROPIC_API_KEY) {
    return { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN };
  }
  throw new Error("Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN in .env");
}

// The Agent SDK streams one JSON message per line; render the interesting ones
function renderMessage(line: string) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    console.log(line); // not a JSON message (e.g. a stray log), print it as-is
    return;
  }

  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        console.log(`Agent started (model: ${message.model})`);
      }
      break;
    case "assistant":
      for (const block of message.message.content) {
        if (block.type === "text") {
          console.log(block.text);
        } else if (block.type === "tool_use") {
          const input = JSON.stringify(block.input);
          console.log(
            `> ${block.name} ${input.length > 120 ? input.slice(0, 120) + "…" : input}`,
          );
        }
      }
      break;
    case "result":
      console.log(
        `\nAgent finished: ${message.subtype} (${message.num_turns} turns, ` +
          `$${message.total_cost_usd?.toFixed(4)}, ${(message.duration_ms / 1000).toFixed(1)}s)`,
      );
      break;
  }
}

const sbx = await Sandbox.create(templateName, {
  timeoutMs: 10 * 60 * 1000,
  envs: agentCredentials(),
});

console.log("Sandbox created", sbx.sandboxId);

// Upload the agent script into the sandbox
const agentScript = fs.readFileSync(
  fileURLToPath(new URL("./agent.mjs", import.meta.url)),
  "utf8",
);
await sbx.files.write("/agent/agent.mjs", agentScript);

// Run the agent and stream its messages back, line by line
let buffer = "";
await sbx.commands.run("node /agent/agent.mjs", {
  timeoutMs: 0, // agents can run for a long time
  envs: { AGENT_PROMPT: PROMPT },
  onStdout: (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) renderMessage(line);
    }
  },
  onStderr: (chunk) => {
    process.stderr.write(chunk);
  },
});
if (buffer.trim()) renderMessage(buffer);

// Download everything the agent produced in its workspace
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const entries = await sbx.files.list("/agent/workspace");
if (!entries.some((entry) => entry.type === "file")) {
  console.log("No files found in /agent/workspace");
}
for (const entry of entries) {
  if (entry.type !== "file") continue;
  const content = await sbx.files.read(entry.path);
  const localPath = path.join(OUTPUT_DIR, entry.name);
  fs.writeFileSync(localPath, content);
  console.log(`Downloaded ${entry.path} -> ${localPath}`);
}

await sbx.kill();
