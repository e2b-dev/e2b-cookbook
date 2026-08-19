/* eslint-disable */
import { Sandbox } from "@e2b/code-interpreter";
import type { AgentResult } from "@inngest/agent-kit";

export function lastAssistantTextMessageContent(result: AgentResult) {
  const lastAssistantMessageIndex = result.output.findLastIndex(
    (message: any) => message.role === "assistant"
  );
  const message = result.output[lastAssistantMessageIndex];
  if (!message || !("content" in message)) return undefined;

  const content = message.content;
  if (!content) return undefined;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((c: any) => c.text || "").join("");
  }

  return undefined;
}

export async function getSandbox(sandboxId: string) {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.setTimeout(5 * 60_000);
  return sandbox;
}
