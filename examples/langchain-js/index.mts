import { ChatOpenAI } from "@langchain/openai"
import { config } from "dotenv"
import { CodeInterpreter } from "@e2b/code-interpreter"
import { AgentExecutor, createToolCallingAgent } from "langchain/agents"
import { z } from "zod"
import { StructuredTool, StructuredToolInterface } from "@langchain/core/tools"
import { ChatPromptTemplate } from "@langchain/core/prompts"
import { BaseOutputParser } from "@langchain/core/output_parsers";
import { AgentAction, AgentFinish } from "@langchain/core/agents";
import { ChatGeneration } from "@langchain/core/outputs";
import { RunnablePassthrough } from "@langchain/core/runnables";
import { ToolMessage } from "@langchain/core/messages";


config();

/** Define the chat model */
const llm = new ChatOpenAI({
  model: "gpt-3.5-turbo-0125",
  temperature: 0,
  streaming: false,
})


function formatToToolMessages(
    input: any
): any[] {
    const messages = []

    const intermediate_steps = input.intermediate_steps
    if (intermediate_steps) {
        for (const [agent_action, observation] of intermediate_steps) {
            if (agent_action.tool == "code_interpreter") {
                const new_messages = agent_action.message_log

                const content = JSON.stringify(observation, null, 2)

                new_messages.push(
                    new ToolMessage({content}, agent_action.tool_call_id)
                )

                messages.push(...new_messages)
            } else {
                // Handle other tools
                console.log("Not handling tool: ", agent_action.tool)
            }
        }
    }
    return messages
}


class ToolCallingAgentOutputParser extends BaseOutputParser<
  AgentAction[] | AgentFinish
> {
  lc_namespace = ["langchain", "agents", "tool_calling"];

  static lc_name() {
    return "ToolCallingAgentOutputParser";
  }

  async parse(text: string): Promise<AgentAction[] | AgentFinish> {
    throw new Error(
      `ToolCallingAgentOutputParser can only parse messages.\nPassed input: ${text}`
    );
  }

  async parseResult(generations: ChatGeneration[]) {
    const message = generations[0]["message"]
    if (message['steps'] && message['steps'][0] && message['steps'][0]['action']['tool'] == "code_interpreter") {
      const result = JSON.parse(message['steps'][0].observation)
      result.results[0] = result.results[0].text
      message['steps'][0].observation = JSON.stringify(result)
    }
    return message
  }

  getFormatInstructions(): string {
    throw new Error(
      "getFormatInstructions not implemented inside ToolCallingAgentOutputParser."
    );
  }
}

const codeInterpreter = await CodeInterpreter.create()


class CodeInterpreterTool extends StructuredTool {
  name = "code_interpreter";

  description = "Execute python code in a Jupyter notebook cell and returns any rich data (eg charts), stdout, stderr, and error";

  schema = z.object({
    code: z.string().describe("Python to execute in the Jupyter notebook cell."),
  });

  async _call(input: z.infer<typeof this["schema"]>): Promise<any> {
    const execution = await codeInterpreter.notebook.execCell(input.code);
    return JSON.stringify(execution.toJSON());
  }
}

const codeInterpreterTool = new CodeInterpreterTool();
const tools: StructuredToolInterface[] = [codeInterpreterTool];

const exampleQ = `plot and show sinus?`;


const prompt = ChatPromptTemplate.fromMessages(
  [["human", "{input}"], ["placeholder", "{agent_scratchpad}"]]
)

const parser = new ToolCallingAgentOutputParser()

const passthrough = RunnablePassthrough.assign({
      agent_scratchpad: (x) => formatToToolMessages(x)
    }
  )

const toolCallingAgent = await createToolCallingAgent({
  llm,
  tools,
  prompt,
})

const agent = passthrough.pipe(toolCallingAgent).pipe(parser)


const executor = AgentExecutor.fromAgentAndTools({
  agent,
  tools,
  verbose: true,
  returnIntermediateSteps: true,
});

const output = await executor.invoke({input: exampleQ});
console.log(output)

await codeInterpreter.close()
process.exit(0)
