import { z } from 'zod'
import {
  type CoreMessage,
  StreamingTextResponse,
  StreamData,
  streamText,
  tool,
} from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

import {
  runPython,
} from '@/lib/sandbox'

export interface ServerMessage {
  role: 'user' | 'assistant' | 'function';
  content: string;
}

// simulate simple monte carlo method with 1000 iterations. At each iteration, create a point and check if that point was inside the unit circle. If the point was inside, make it green. At the end show me visualization that shows all the points that you created in every iteration

export async function POST(req: Request) {
  const { messages }: { messages: CoreMessage[] } = await req.json()
  // Simulate user ID
  const userID = 'dummy-user-id'

  let data: StreamData = new StreamData()

  const result = await streamText({
    model: anthropic('claude-3-5-sonnet-20240620'),
    tools: {
      runPython: tool({
        description: 'Runs Python code.',
        parameters: z.object({
          title: z.string().describe('Short title (5 words max) of the artifact.'),
          description: z.string().describe('Short description (10 words max) of the artifact.'),
          code: z.string().describe('The code to run.'),
        }),
        async execute({ code }) {
          data.append({
            tool: 'runPython',
            state: 'running',
          })

          const execOutput = await runPython(userID, code)
          const stdout = execOutput.logs.stdout
          const stderr = execOutput.logs.stderr
          const runtimeError = execOutput.error
          const results = execOutput.results

          data.append({
            tool: 'runPython',
            state: 'complete',
          })

          return {
            stdout,
            stderr,
            runtimeError,
            cellResults: results,
          }
        },
      }),
    },
    toolChoice: 'auto',
    system: `
    You are a skilled Python developer.
    One of your expertise is also data science.
    You can run Python, and bash code. Code for each programming language runs in its own context and reference previous definitions and variables.
    The code runs inside a Jupyter notebook so we can easily get visualizations.
    Use seaborn for data visualization.

    Messages inside [] means that it's a UI element or a user event. For example:
    - "[Chart was generated]" means a chart in a Jupyter notebook was generated and displayed to user.
    `,
    messages,
  })


  const stream = result.toAIStream({
    async onFinal() {
      await data.close()
    }
  })

  return new StreamingTextResponse(stream, {}, data);
}
