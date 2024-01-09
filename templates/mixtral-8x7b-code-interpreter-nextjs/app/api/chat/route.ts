import {
  OpenAIStream,
  StreamingTextResponse,
  experimental_StreamData,
} from 'ai'
import OpenAI from 'openai'
import { CodeInterpreter } from '@e2b/sdk'
import { Marked } from 'marked'
import { systemPrompt } from '@/lib/prompt'
import crypto from 'node:crypto'



function calculateHash(inputString: string) {
  return crypto.createHash('sha256').update(inputString).digest('hex');
}

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
  codeBlocks: { [key: string]: { hash: string, code: string, lang: string } } = {}
  public readable: ReadableStream
  public writable: WritableStream

  promises: Promise<any>[] = []

  constructor(data: experimental_StreamData, sandbox: CodeInterpreter, cb: { onFinal: (promises: Promise<any>[]) => void }) {
    const textDecoder = new TextDecoder('utf-8');
    let completeText = ''

    const marked = new Marked()
    // const marked = new Marked({
    //   renderer: {
    //     code(code) {
    //       // console.log('FINISHED CODE', code)

    //       // promises.push(
    //       //   sandbox.runPython(code)
    //       //     .then(({ stdout, stderr }) => {
    //       //       console.log('✅✅✅FINISHED RUNNING CODE', stdout)
    //       //       // data.append({ stdout, stderr, code })
    //       //     })
    //       // )

    //       return false
    //     },
    //   },
    // })
    console.log('🔥 +++ CONSTRUCTOR')
    const closedCodeBlocks: { code: string, lang: string }[] = []
    let currentCodeBlock = { code: '', lang: '' }


    const that = this
    this.transform = new TransformStream({
      transform(chunk: Uint8Array, controller) {
        const decodedString = textDecoder.decode(chunk)
        // console.log('✅', decodedString)
        completeText += decodedString


        let wasLastTokCode = false
        const codeBlockRegex = /```python\n?([\s\S]*?)```/g

        marked.parse(completeText, {
          walkTokens(token) {
            if (token.type === 'code') {
              console.log('CODE BLOCK FOUND', token.text)
              const matches = token.raw.match(codeBlockRegex)
              if (matches) {
                matches.forEach((match) => {
                  // console.log(match)
                  const hash = calculateHash(match)
                  console.log('hash', hash)
                  if (!that.codeBlocks[hash]) {
                    that.codeBlocks[hash] = { code: token.text, lang: 'python', hash }
                    // data.append({
                    //   hash,
                    //   code: match,
                    //   lang: 'python',
                    // })
                    that.promises.push(sandbox.runPython(token.text))
                  }
                });
              }
            }
          },
        })

        console.log('🏁 codeblocks', that.codeBlocks)
        controller.enqueue(new Uint8Array(chunk))
      },
      flush() {
        cb.onFinal(that.promises)
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
  console.log('1️⃣ POST REQUEST 1️⃣')
  // Extract the `messages` from the body of the request
  const { messages } = await req.json()
  console.log('📨 MESSAGES', messages)


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
      // results.forEach(r => {
      //   data.append({ stdout: r.stdout })
      // })
      console.log('>>> results', results)
      await sandbox.close()
      // data.close()
    }
  })
  const stream = OpenAIStream(response).pipeThrough(sandboxStream)

  // Respond with the stream
  // return new StreamingTextResponse(stream, {}, data)
  return new StreamingTextResponse(stream)
}
