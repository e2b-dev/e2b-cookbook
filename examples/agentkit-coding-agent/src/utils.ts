/* eslint-disable */
import { Sandbox } from "@e2b/code-interpreter";
import {
  InferenceResult,
  Network,
  NetworkRun,
  TextMessage,
} from "@inngest/agent-kit";

export function lastAssistantTextMessageContent(result: InferenceResult) {
  const lastAssistantMessageIndex = result.output.findLastIndex(
    (message) => message.role === "assistant"
  );
  const message = result.output[lastAssistantMessageIndex] as
    | TextMessage
    | undefined;
  return message?.content
    ? typeof message.content === "string"
      ? message.content
      : message.content.map((c) => c.text).join("")
    : undefined;
}

export async function getSandbox(network?: NetworkRun) {
  let sandbox = network?.state.kv.get("sandbox") as Sandbox;
  if (!sandbox) {
    sandbox = await Sandbox.create();
    network?.state.kv.set("sandbox", sandbox);
    network?.state.kv.set("sandbox-created-at", new Date().toISOString());
    network?.state.kv.set("sandbox-timeout", 5);
  }
  // extend sandbox timeout if we are 1min away from it expiring (5 minutes default timeout)
  const sandboxCreatedAt = network?.state.kv.get("sandbox-created-at");
  if (sandboxCreatedAt) {
    const createdAt = new Date(sandboxCreatedAt);
    const timeout = network?.state.kv.get("sandbox-timeout") || 5;
    const minutesSinceLaunch =
      (new Date().getTime() - createdAt.getTime()) / 60000;
    if (minutesSinceLaunch > timeout - 2) {
      const newTimeout = timeout + 2;
      network?.state.kv.set("sandbox-timeout", newTimeout);
      const sandbox = network?.state.kv.get("sandbox") as Sandbox;
      await sandbox.setTimeout(newTimeout);
    }
  }

  return sandbox;
}
