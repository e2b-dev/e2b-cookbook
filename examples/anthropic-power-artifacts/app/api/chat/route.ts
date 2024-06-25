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
import { prompt } from '@/lib/prompt'

export interface ServerMessage {
  role: 'user' | 'assistant' | 'function';
  content: string;
}

export async function POST(req: Request) {
  const { messages, userID }: { messages: CoreMessage[], userID: string } = await req.json()
  console.log('userID', userID)

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
    system: prompt,
    messages,
  })

  const stream = result.toAIStream({
    async onFinal() {
      await data.close()
    }
  })

  return new StreamingTextResponse(stream, {}, data);
}
