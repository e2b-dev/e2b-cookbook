/* eslint-disable */
import { Sandbox } from "@e2b/code-interpreter";
import {
  InferenceResult,
  Message,
  Network,
  NetworkRun,
  TextMessage,
} from "@inngest/agent-kit";

export function prettyPrintLastAssistantMessage(result: InferenceResult) {
  const lastAssistantMessageIndex = result.output.findLastIndex(
    (message) => message.role === "assistant"
  );
  const message = result.output[lastAssistantMessageIndex] as
    | Message
    | undefined;
  if (message) {
    if (message.type === "tool_call") {
      console.log("Agent response > ", `tool call (${message.tools[0].name})`);
    } else if (message.type === "text" && message.content) {
      console.log("Agent response > ", message.content);
    }
  }
}

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
  }
  await sandbox.setTimeout(5 * 60_000);
  network?.state.kv.set("sandbox", sandbox);
  return sandbox;
}
