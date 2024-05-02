import base64 from 'base64';

import { List, Sequence, Tuple } from 'typescript-collections';
import { load_dotenv } from 'dotenv';
import { ChatGroq } from 'langchain-groq';
import { CodeInterpreterFunctionTool } from './codeInterpreterTool';
import { AgentExecutor } from 'langchain/agents';
import { ChatOpenAI } from 'langchain/llms/openai';
import { BaseMessage } from 'langchain/schema';
import { RunnablePassthrough } from 'langchain/runnables';
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { 
  ToolAgentAction,
  ToolsAgentOutputParser,
} from 'langchain/agents';
import { Result } from 'e2b-code-interpreter';

load_dotenv();

function format_to_tool_messages(
  intermediate_steps: Sequence<[ToolAgentAction, Record<string, any>]>,
): BaseMessage[] {
  const messages: BaseMessage[] = [];
  for (const [agent_action, observation] of intermediate_steps) {
    if (agent_action.tool === CodeInterpreterFunctionTool.tool_name) {
      const new_messages = CodeInterpreterFunctionTool.format_to_tool_message(
        agent_action,
        observation,
      );
      messages.push(...new_messages.filter(new => !messages.includes(new)));
    } else {
      // Handle other tools
      console.log("Not handling tool: ", agent_action.tool);
    }
  }

  return messages;
}


async function main() {
  // 1. Pick your favorite llm
  const llm = new ChatOpenAI({ modelName: "gpt-3.5-turbo-0125", temperature: 0 });
  // const llm = new ChatGroq({ temperature: 0, modelName: "llama3-70b-8192" });

  // 2. Initialize the code interpreter tool
  const code_interpreter = new CodeInterpreterFunctionTool();
  const code_interpreter_tool = code_interpreter.to_langchain_tool();
  const tools = [code_interpreter_tool];

  // 3. Define the prompt
  const prompt = ChatPromptTemplate.fromPromptMessages([
    { role: "human", content: "{input}" },
    { role: "placeholder", content: "{agent_scratchpad}" },
  ]);

  // 4. Define the agent
  const agent = RunnablePassthrough.assign({
    agent_scratchpad: (x: any) => format_to_tool_messages(x.intermediate_steps),
  })
    .pipe(prompt)
    .pipe(llm.bindTools(tools))
    .pipe(new ToolsAgentOutputParser());

  const agent_executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    returnIntermediateSteps: true,
  });

  // 5. Invoke the agent
  const result = await agent_executor.invoke({ input: "plot and show sinus" });

  code_interpreter.close();

  console.log(result);

  // Each intermediate step is a Tuple[ToolAgentAction, dict]
  const r: Result = result.intermediate_steps[0][1].results[0];

  // Save the chart image
  for (const [format, data] of Object.entries(r.raw)) {
    if (format === "image/png") {
      const buffer = Buffer.from(data, 'base64');
      await fs.promises.writeFile("image.png", buffer);
    } else {
      console.log(data);
    }
  }
}
