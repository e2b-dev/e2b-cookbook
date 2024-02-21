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
  // Extract the `messages` from the body of the request
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

  const sandboxStream = sandbox.autorun({
    // runtimeMode: 'parallel',
    languages: [
      'python',
      // 'bash'
    ],
    async onFinal(promises) {
      console.log('✨✨✨ finished parsing')
      const results = await Promise.all(promises)
      console.log('>>> results', results)
      await sandbox.close()
    },
  })

  // TODO: We can have a similar stream that only registers
  // the code blocks and run them on user's submit:
  // const sandboxStream = sandbox.register({
  //   async onFinal(promises) {
  //     // TODO:... what here?
  //     await sandbox.close()
  //   }
  // })

  const stream = OpenAIStream(response)
    .pipeThrough(sandboxStream)
  return new StreamingTextResponse(stream)
}
