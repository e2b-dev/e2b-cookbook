import {
  OpenAIStream,
  StreamingTextResponse,
} from 'ai'
import OpenAI from 'openai'





const client = new OpenAI()

export async function POST(req: Request) {
  const { messages } = await req.json()

  // TODO:
  const response = await client.chat.completions.create({
    model: 'gpt-3.5',
    stream: true,
    max_tokens: 1000,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful developer. Respond in markdown',
      },
      ...messages,
    ],
  })

  const stream = OpenAIStream(response)

  // Respond with the stream
  return new StreamingTextResponse(stream)
}
