import assert from "node:assert/strict";
import { test } from "node:test";
import { insideWorkspace, stayInWorkspace } from "./workspace.ts";

const hook = stayInWorkspace("/srv/box");
const decide = async (tool_name: string, tool_input: Record<string, string>) => {
  const output = await hook(
    { hook_event_name: "PreToolUse", tool_name, tool_input, tool_use_id: "t1", session_id: "s", transcript_path: "", cwd: "/srv/box" },
    "t1",
    { signal: new AbortController().signal },
  );
  return "hookSpecificOutput" in output && output.hookSpecificOutput?.hookEventName === "PreToolUse"
    ? output.hookSpecificOutput.permissionDecision
    : "allow";
};

test("insideWorkspace accepts paths in the workspace and rejects escapes", () => {
  assert.equal(insideWorkspace("/srv/box", "Incoming/a.docx"), true);
  assert.equal(insideWorkspace("/srv/box", "/srv/box/Playbook/p.md"), true);
  assert.equal(insideWorkspace("/srv/box", "../../etc/passwd"), false);
  assert.equal(insideWorkspace("/srv/box", "/proc/self/environ"), false);
  assert.equal(insideWorkspace("/srv/box", "/srv/boxer/x"), false);
});

test("Read and Glob are allowed inside the workspace", async () => {
  assert.equal(await decide("Read", { file_path: "/srv/box/Playbook/contract-playbook.md" }), "allow");
  assert.equal(await decide("Glob", { pattern: "Incoming/*.docx" }), "allow");
  assert.equal(await decide("Glob", { pattern: "**/*.md", path: "/srv/box" }), "allow");
});

test("Read and Glob are denied outside the workspace", async () => {
  assert.equal(await decide("Read", { file_path: "/proc/self/environ" }), "deny");
  assert.equal(await decide("Read", { file_path: "/srv/box/../../etc/passwd" }), "deny");
  assert.equal(await decide("Glob", { pattern: "/opt/**" }), "deny");
  assert.equal(await decide("Glob", { pattern: "../../**" }), "deny");
  assert.equal(await decide("Glob", { pattern: "*", path: "/opt/box-mount" }), "deny");
});
