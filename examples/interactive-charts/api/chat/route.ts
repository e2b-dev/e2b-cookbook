import { streamText, convertToCoreMessages, Message } from "ai";
import { getModel } from "@/app/lib/model";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a sophisticated python data scientist/analyst...`; // rest of your prompt

export async function POST(req: Request) {
  const { messages } = await req.json();
  
  const filteredMessages = messages.map((message) => {
    if (message.toolInvocations) {
      return {
        ...message,
        toolInvocations: undefined,
      };
    }
    return message;
  });

  const result = await streamText({
    system: SYSTEM_PROMPT,
    model: getModel(),
    messages: convertToCoreMessages(filteredMessages),
  });

  return result.toDataStreamResponse();
}