import {
  OpenAIStream,
  StreamingTextResponse,
} from 'ai'
import OpenAI from 'openai'
import { systemPrompt } from '@/lib/prompt'

import { sandbox } from '@/lib/sandbox'

const fireworks = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY || '',
  baseURL: 'https://api.fireworks.ai/inference/v1',
})

export async function POST(req: Request) {
  const { messages } = await req.json()

  const response = await fireworks.chat.completions.create({
    model: 'accounts/fireworks/models/mixtral-8x7b-instruct',
    stream: true,
    max_tokens: 1000,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...messages,
    ],
  })

  await sandbox.init()
  const hostname = sandbox.sbx?.getHostname()
  console.log('🔗🔗🔗 Sandbox hostname is', hostname)

  const sandboxStream = sandbox.autorun({
    languages: [
      'python',
      'bash',
    ],
    async onFinal(promises) {
      const results = await Promise.all(promises)
      // console.log('>>> results', results)
      await sandbox.close()
    },
  })

  const stream = OpenAIStream(response)
    .pipeThrough(sandboxStream)
  return new StreamingTextResponse(stream)
}
