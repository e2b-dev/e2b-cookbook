import {
  OpenAIStream,
  StreamingTextResponse,
  Tool,
  ToolCallPayload,
  StreamData,
  CreateMessage,
} from 'ai';
import OpenAI from 'openai';
import { evaluateCode, nonEmpty } from './codeInterpreter';

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export const dynamic = 'force-dynamic';

// You can also use edge runtime
// export const runtime = 'edge';

const tools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'execute_python_code',
      description: 'Execute python code in Jupyter Notebook via code interpreter.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: `Python code that will be directly executed via Jupyter Notebook.
The stdout, stderr and results will be returned as a JSON object.
Subsequent calls to the tool will keep the state of the interpreter.`,
          },
        },
        required: ['code'],
      },
    },
  },
];

export async function POST(req: Request) {
  const { messages, sessionID } = await req.json();

  const model = 'gpt-4-turbo';

  const response = await openai.chat.completions.create({
    model,
    stream: true,
    messages,
    tools,
    tool_choice: 'auto',
  });

  const data = new StreamData();
  const stream = OpenAIStream(response, {
    experimental_onToolCall: async (
      call: ToolCallPayload,
      appendToolCallMessage,
    ) => {
      const newMessages: CreateMessage[] = [];

      for (const toolCall of call.tools) {
        if (toolCall.func.name === 'execute_python_code') {
          const evaluation = await evaluateCode(
            sessionID, toolCall.func.arguments.code as string,
          );

          data.append({
            messageIdx: messages.length,
            function_name: "execute_python_code",
            parameters: {
              code: toolCall.func.arguments.code as string
            },
            tool_call_id: toolCall.id,
            evaluation: {
              stdout: evaluation.stdout,
              stderr: evaluation.stderr,
              ...(evaluation.error && {
                error: {
                  traceback: evaluation.error.traceback,
                  name: evaluation.error.name,
                  value: evaluation.error.value,
                }
              }),
              results: evaluation.results.map(t => JSON.parse(JSON.stringify(t))),
            }
          });

          const msgs = appendToolCallMessage({
            tool_call_id: toolCall.id,
            function_name: 'execute_python_code',
            tool_call_result: {
              stdout: evaluation.stdout,
              stderr: evaluation.stderr,
              ...(evaluation.error && {
                traceback: evaluation.error.traceback,
                name: evaluation.error.name,
                value: evaluation.error.value,
              }),
              // Pass only text results to the LLM (to avoid passing encoded media files)
              results: evaluation.results.map(result => result.text).filter(nonEmpty),
            },
          });

          newMessages.push(...msgs);
        }
      }

      return openai.chat.completions.create({
        messages: [...messages, ...newMessages],
        model,
        stream: true,
        tools,
        tool_choice: 'auto',
      });
    },
    onCompletion(completion) {
      console.log('completion', completion);
    },
    onFinal(completion) {
      data.close();
    },
  });

  return new StreamingTextResponse(stream, {}, data);
}