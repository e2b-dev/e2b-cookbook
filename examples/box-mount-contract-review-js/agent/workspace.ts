// Keeps the agent inside the Box workspace. Box content is untrusted, so the agent must not
// read the rest of the sandbox (for example its own environment, which holds the model key).
import { resolve, sep } from "node:path";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export function insideWorkspace(workspace: string, path: string): boolean {
  const root = resolve(workspace);
  const full = resolve(root, path);
  return full === root || full.startsWith(root + sep);
}

const toolPaths = z.object({ file_path: z.string().optional(), path: z.string().optional(), pattern: z.string().optional() });

// A PreToolUse hook for Read and Glob that denies any path or glob pattern outside `workspace`.
export function stayInWorkspace(workspace: string): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const { file_path, path, pattern } = toolPaths.parse(input.tool_input);
    const outside = [file_path, path].some((p) => p !== undefined && !insideWorkspace(workspace, p));
    const escapes = pattern !== undefined && (pattern.startsWith("/") || pattern.split("/").includes(".."));
    if (!outside && !escapes) return {};
    process.stderr.write(`${JSON.stringify({ event: "blocked", name: input.tool_name })}\n`);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Only files in the Box workspace can be read.",
      },
    };
  };
}
