import {
  AIStream,
  OpenAIStream,
  StreamingTextResponse,
  experimental_StreamData,
} from 'ai'
import OpenAI from 'openai'
import { CodeInterpreter } from '@e2b/sdk'
import { Marked } from 'marked'
import { systemPrompt } from '@/lib/prompt'
import { createClient } from '@supabase/supabase-js'
import md5 from 'md5'


const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_KEY as string,
)


const langIdentifiers = {
  python: {
    prefix: '```python',
    lang: 'python',
  },
  bash: {
    prefix: '```bash',
    lang: 'bash',
  },
}

class SandboxAutorun {
  encoder = new TextEncoder()
  transform = new TransformStream()
  // codeBlocks: { [key: string]: { hash: string, code: string, lang: string } } = {}
  hashes = new Set<string>()
  public readable: ReadableStream
  public writable: WritableStream

  promises: Promise<any>[] = []

  constructor(data: experimental_StreamData, sandbox: CodeInterpreter, cb: { onFinal: (promises: Promise<any>[]) => void }) {
    const textDecoder = new TextDecoder('utf-8');
    let completeText = ''

    const marked = new Marked()


    const self = this
    this.transform = new TransformStream({
      transform(chunk: Uint8Array, controller) {
        let decodedString = textDecoder.decode(chunk)
        completeText += decodedString


        const codeBlockRegex = /```python\n?([\s\S]*?)```/g

        marked.parse(completeText, {
          walkTokens(token) {
            if (token.type === 'code' || token.type === 'codespan') {
              const matches = token.raw.match(codeBlockRegex)
              if (matches) {
                matches.forEach(() => {
                  const hash = md5(token.text.trim())
                  console.log('1️⃣', hash, ':\n', token.text)
                  if (!self.hashes.has(hash)) {
                    self.hashes.add(hash)

                    self.promises.push(
                      sandbox.runPython(token.text).then(({ stdout, stderr }) => {
                        console.log('code executed', { stdout, stderr })
                        console.log('Setting supabase value')
                        return supabase.from('code_blocks').upsert({ hash, stdout, stderr })
                      })
                    )
                  }
                });
              }
            }
          },
        })

        controller.enqueue(chunk)
      },
      async flush() {
        await cb.onFinal(self.promises)
      },
    })

    this.readable = this.transform.readable
    this.writable = this.transform.writable
  }
}

interface Sandbox {
  sbx?: CodeInterpreter,
  init: () => Promise<void>,
  autorun: (data: experimental_StreamData, cb: { onFinal: (promises: Promise<any>[]) => void }) => TransformStream
  close: () => Promise<void>
}
const sandbox: Sandbox = {
  async init() {
    this.sbx = await CodeInterpreter.create()
  },
  autorun(data: experimental_StreamData, cb: { onFinal: (promsies: Promise<any>[]) => void }) {
    return new SandboxAutorun(data, this.sbx!, cb)
  },

  close() {
    return this.sbx!.close()
  }
}

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

  const data = new experimental_StreamData()
  await sandbox.init()

  const sandboxStream = sandbox.autorun(data, {
    async onFinal(promises) {
      console.log('✨✨✨ finished parsing')
      const results = await Promise.all(promises)
      console.log('>>> results', results)
      await sandbox.close()
    }
  })

  const stream = OpenAIStream(response).pipeThrough(sandboxStream)
  return new StreamingTextResponse(stream)
}
