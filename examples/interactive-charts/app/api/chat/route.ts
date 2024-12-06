import { streamText, convertToCoreMessages, Message } from "ai";
import { getModel } from "@/app/lib/model";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a sophisticated python data scientist/analyst.
Generate a python script that creates and visualizes random data in an interactive way.
Generate a python script to be run in a Jupyter notebook that:
1. Generates random data
2. Creates a DataFrame
3. For interactive mode, return the data in a format that can be used by ECharts:
   - For bar charts: Include a 'chart' extra with type 'bar' and elements with labels and values
   - Store the chart data in result.extra.chart
4. Also create a static visualization as backup

The following libraries are already installed:
- jupyter
- numpy
- pandas
- matplotlib
- seaborn

Make sure to structure the data appropriately for interactive visualization.s`;

export async function POST(req: Request) {
  const { messages } = await req.json();
  console.log("Received messages:", messages);
  
  console.log("LLM Request:", {
    system: SYSTEM_PROMPT,
    messages: messages
  });

  const filteredMessages = messages.map((message) => {
    if (message.toolInvocations) {
      return {
        ...message,
        toolInvocations: undefined,
      };
    }
    return message;
  });

  try {
    const response = await streamText({
      system: SYSTEM_PROMPT,
      model: getModel(),
      messages: convertToCoreMessages(filteredMessages),
    });
    
    console.log("LLM Stream created");
    const result = response.toDataStreamResponse();
    console.log("Response transformed to stream");
    
    return result;
  } catch (error) {
    console.error("Chat route error:", error);
    throw error;
  }
}