import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

import { evaluateCode, nonEmpty } from './codeInterpreter';

export const dynamic = 'force-dynamic';

// The model runs a tool, waits for the sandbox, then answers, so give it room.
export const maxDuration = 60;

const MODEL = 'gpt-5.6-terra';

export async function POST(req: Request) {
  const { messages, sessionID }: { messages: UIMessage[]; sessionID: string } =
    await req.json();

  const result = streamText({
    model: openai(MODEL),
    messages: await convertToModelMessages(messages),
    // gpt-5.6-* are reasoning models. Function tools on them require reasoning
    // effort to be off, otherwise the API rejects the request.
    providerOptions: { openai: { reasoningEffort: 'none' } },
    // Let the model call the tool and then answer with the result. Without this
    // the stream stops at the tool call and the user never sees a reply.
    stopWhen: stepCountIs(5),
    tools: {
      execute_python_code: tool({
        description:
          'Execute python code in a Jupyter notebook via the E2B code interpreter. ' +
          'Subsequent calls keep the state of the interpreter.',
        inputSchema: z.object({
          code: z
            .string()
            .describe(
              'Python code that will be executed in a Jupyter notebook. ' +
                'stdout, stderr and results are returned.',
            ),
        }),
        execute: async ({ code }) => {
          const evaluation = await evaluateCode(sessionID, code);

          return {
            code,
            stdout: evaluation.stdout,
            stderr: evaluation.stderr,
            ...(evaluation.error && {
              error: {
                traceback: evaluation.error.traceback,
                name: evaluation.error.name,
                value: evaluation.error.value,
              },
            }),
            // Only text results go back to the model, so encoded media (charts,
            // images) never ends up in the prompt.
            results: evaluation.results.map((r) => r.text).filter(nonEmpty),
          };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
