// Runs inside the sandbox as the unprivileged `agent` user, which has no Box credentials.
// The agent only reads the mounted Box files. It prints the memo; the orchestrator saves it.
import { resolve } from "node:path";
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import mammoth from "mammoth";
import { z } from "zod";
import { insideWorkspace, stayInWorkspace } from "./workspace.ts";

const [workspaceArg, contractPath, playbookPath] = process.argv.slice(2);
if (!workspaceArg || !contractPath || !playbookPath) {
  throw new Error("usage: node review.ts <workspace> <contract.docx> <playbook.md>");
}
const workspace = resolve(workspaceArg);

const contractTools = createSdkMcpServer({
  name: "contract",
  version: "1.0.0",
  tools: [
    tool(
      "read_docx",
      "Extract the plain text of a .docx file in the workspace.",
      { path: z.string().describe("Path relative to the workspace") },
      async ({ path }) => {
        if (!insideWorkspace(workspace, path)) throw new Error(`${path} is outside the workspace.`);
        const { value } = await mammoth.extractRawText({ path: resolve(workspace, path) });
        return { content: [{ type: "text", text: value }] };
      },
    ),
  ],
});

const prompt = [
  "You are a first-pass contract review assistant for a qualified enterprise legal team.",
  "The current directory is a Box folder synced into this sandbox.",
  `Read the agreement ${contractPath} with read_docx and the approved playbook ${playbookPath} with Read.`,
  "Compare the agreement against the playbook. Follow the playbook's review standard and required output.",
  "Cite the agreement section for every finding and do not invent clauses.",
  "Reply with the complete review memo in Markdown only.",
].join("\n");

// Progress goes to stderr as one JSON object per line, for the host to render. stdout is the memo only.
const emit = (event: Record<string, unknown>) => process.stderr.write(`${JSON.stringify(event)}\n`);

let memo = "";
for await (const message of query({
  prompt,
  options: {
    cwd: workspace,
    model: process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001",
    tools: ["Read", "Glob"],
    allowedTools: ["Read", "Glob", "mcp__contract__read_docx"],
    mcpServers: { contract: contractTools },
    // The workspace is Box content that anyone with access to the folder can change.
    // Never load settings, hooks or MCP servers from it.
    settingSources: [],
    strictMcpConfig: true,
    hooks: { PreToolUse: [{ matcher: "Read|Glob", hooks: [stayInWorkspace(workspace)] }] },
    permissionMode: "dontAsk",
    maxTurns: 12,
    maxBudgetUsd: 0.5,
  },
})) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "tool_use") emit({ event: "tool", id: block.id, name: block.name, input: block.input });
    }
  } else if (message.type === "user" && Array.isArray(message.message.content)) {
    for (const block of message.message.content) {
      if (block.type !== "tool_result") continue;
      const text = typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");
      emit({ event: "tool_result", id: block.tool_use_id, error: block.is_error === true, chars: text.length });
    }
  } else if (message.type === "result") {
    if (message.subtype !== "success") throw new Error(`Agent stopped: ${message.subtype}`);
    memo = message.result.trim();
    emit({ event: "result", turns: message.num_turns, costUsd: message.total_cost_usd });
  }
}
if (!memo) throw new Error("Agent returned no memo.");
process.stdout.write(`${memo}\n`);
