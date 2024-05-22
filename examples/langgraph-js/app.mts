import { config } from 'dotenv'
import { ChatOpenAI } from '@langchain/openai'
import { END, MessageGraph, START } from '@langchain/langgraph'
import { ToolMessage } from '@langchain/core/messages/tool'
import { CodeInterpreter, Execution } from '@e2b/code-interpreter'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { HumanMessage, BaseMessage } from '@langchain/core/messages'
import * as fs from 'node:fs'

config()

function extractInfoFromExecution(execution: Execution): string {
  /**
   * Format the output of the CodeInterpreter tool to be returned as a ToolMessage.
   **/

  if (execution.error) {
    return `${execution.error.name}: ${execution.error.value}`
  }

  let info = ''
  if (execution.logs.stdout.length) {
    info += 'Stdout: ' + execution.logs.stdout.join('\n') + '\n'
  }
  if (execution.logs.stderr.length) {
    info += 'Stderr: ' + execution.logs.stderr.join('\n') + '\n'
  }

  for (const r of execution.results) {
    info += 'The execution has following result: ' + r.text + '\n'
    if (r.formats()) {
      info += `The result has also following formats: ${r
        .formats()
        .join(', ')}\n`
    }
    info += '\n'
  }

  return info
}

// Define the function that determines whether to continue or not
function shouldContinue(messages: any[]) {
  const lastMessage = messages[messages.length - 1]
  // If there is no function call, then we finish
  if (lastMessage.tool_calls.length === 0) {
    return END
  } else {
    return 'action'
  }
}

class RichDataToolMessage extends ToolMessage {
  constructor(content: string, toolCallId: string, public rawOutput?: Execution) {
    super(content, toolCallId)
    this.rawOutput = rawOutput
  }
}

// Handle tools execution
async function executeTools(
  messages: any[],
  codeInterpreterTool: DynamicStructuredTool,
): Promise<BaseMessage[]> {
  const tool_messages = []
  for (const toolCall of messages[messages.length - 1].tool_calls) {
    const execution = await codeInterpreterTool.invoke(toolCall['args']) as unknown as Execution
    tool_messages.push(
      new RichDataToolMessage(extractInfoFromExecution(execution), toolCall['id'], execution),
    )
  }
  return tool_messages
}

async function main() {
  // 1. Pick your favorite llm
  const llm = new ChatOpenAI({
    model: 'gpt-3.5-turbo-0125',
    temperature: 0,
  })

  // 2. Initialize the code interpreter tool
  const codeInterpreter = await CodeInterpreter.create()
  const codeInterpreterTool = new DynamicStructuredTool({
    name: 'code_interpreter',
    description:
      'Execute python code in a Jupyter notebook cell and returns any rich data (eg charts), stdout, stderr, and error',
    schema: z.object({
      code: z.string().describe('The python code to execute'),
    }),
    func: async ({ code }: { code: string }): Promise<Execution> => {
      return codeInterpreter.notebook.execCell(code)
    },
  })

  // 3. Define the conditional function
  const workflow = new MessageGraph()
  workflow.addNode('agent', llm.bindTools([codeInterpreterTool]))
  workflow.addNode('action', (x) => executeTools(x, codeInterpreterTool))

  // Conditional agent -> action OR agent -> END
  workflow.addConditionalEdges('agent', shouldContinue)

  // Always transition `action` -> `agent`
  workflow.addEdge('action', 'agent')

  workflow.addEdge(START, 'agent')
  const app = workflow.compile()

  // 4. Invoke the graph
  const result: (RichDataToolMessage | BaseMessage)[] = await app.invoke([new HumanMessage('plot and show sinus')])
  await codeInterpreter.close()

  // Save the chart image
  for (const message of result) {
    if (message instanceof RichDataToolMessage) {
      const rs = message.rawOutput?.results || []
      for (const r of rs) {
        for (const format in r.raw) {
          if (format == 'image/png') {
            fs.writeFileSync('image.png', Buffer.from(r.raw[format], 'base64'))
          } else {
            console.log(r.raw[format])
          }
        }
      }
    }
  }
}

await main()
