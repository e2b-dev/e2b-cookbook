import { getModel } from "@/app/lib/model";
import { toPrompt } from "@/app/lib/prompt";
import { streamText, convertToCoreMessages, Message } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();
  
  // Filter out tool invocations from previous messages
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
    system: toPrompt(), // We'll need to create this prompt
    model: getModel(),  // We already have this
    messages: convertToCoreMessages(filteredMessages),
  });

  return result.toDataStreamResponse();
}