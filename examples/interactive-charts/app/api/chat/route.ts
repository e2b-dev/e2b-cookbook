import { streamText, convertToCoreMessages, Message } from "ai";
import { getModel } from "@/app/lib/model";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a sophisticated python data scientist/analyst.
Generate a python script that creates and visualizes random data in an interesting way.
Generate a python script to be run in a Jupyter notebook that generates random data and renders a plot.
Only one code block is allowed, use markdown code blocks.

The following libraries are already installed:
- jupyter
- numpy
- pandas
- matplotlib
- seaborn

Your task is to:
1. Generate some random but meaningful data
2. Create a visualization that shows interesting patterns or relationships in this data
3. Make sure to use proper labels and titles`;

export async function POST(req: Request) {
  const { messages } = await req.json();
  console.log("Received messages:", messages); // Log incoming messages
  
  const filteredMessages = messages.map((message) => {
    if (message.toolInvocations) {
      return {
        ...message,
        toolInvocations: undefined,
      };
    }
    return message;
  });
  console.log("Filtered messages:", filteredMessages); // Log filtered messages

  try {
    const result = await streamText({
      system: SYSTEM_PROMPT,
      model: getModel(),
      messages: convertToCoreMessages(filteredMessages),
    });
    console.log("Stream created successfully"); // Log successful stream creation

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Error in chat route:", error); // Log any errors
    throw error;
  }
}