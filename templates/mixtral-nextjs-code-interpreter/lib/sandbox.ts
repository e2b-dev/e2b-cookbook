import { Marked } from 'marked'
import md5 from 'md5'
import { CodeInterpreter } from '@e2b/sdk'
import { createClient } from '@supabase/supabase-js'


const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_KEY as string,
)

export interface Sandbox {
  sbx?: CodeInterpreter,
  init: () => Promise<void>,
  autorun: (opts: AutorunCallbacksAndOptions) => TransformStream
  close: () => Promise<void>
}

export interface AutorunCallbacksAndOptions {
  onFinal?: (promises: Promise<any>[]) => Promise<void> | void
  runtimeMode?: 'sequential' | 'parallel'
  languages: string[]
}

export const DefaultAutorunCallbacksAndOptions: AutorunCallbacksAndOptions = {
  runtimeMode: 'sequential',
  languages: [],
}

class SandboxAutorun {
  encoder = new TextEncoder()
  transform = new TransformStream()
  hashes = new Set<string>()
  public readable: ReadableStream
  public writable: WritableStream

  promises: Promise<any>[] = []

  constructor(sandbox: CodeInterpreter, opts: AutorunCallbacksAndOptions) {
    const textDecoder = new TextDecoder('utf-8');
    let completeText = ''

    const marked = new Marked()


    let lastChunk: Uint8Array | undefined
    const self = this
    this.transform = new TransformStream({
      transform(chunk: Uint8Array, controller) {
        let decodedString = textDecoder.decode(chunk)
        completeText += decodedString

        const startCodeBlockRegex = /```python/g

        const fullPythonOrBashCodeBlockRegex = /```(python|bash)\n?([\s\S]*?)```/g

        marked.parse(completeText, {
          walkTokens(token) {
            if (token.type === 'code' || token.type === 'codespan') {
              const matches = token.raw.match(fullPythonOrBashCodeBlockRegex)
              if (matches) {
                matches.forEach(() => {
                  const hash = md5(token.text.trim())
                  if (!self.hashes.has(hash)) {
                    self.hashes.add(hash)


                    if (token.raw.startsWith('```python')) {
                      self.promises.push(
                        sandbox.runPython(token.text).then(({ stdout, stderr }) => {
                          console.log('Python code executed', { stdout, stderr })
                          console.log('Setting supabase value')
                          return supabase.from('code_blocks').upsert({ hash, stdout, stderr })
                        })
                      )
                    }

                    if (token.raw.startsWith('```bash')) {
                      self.promises.push(
                        sandbox.process.startAndWait(token.text).then(({ stdout, stderr }) => {
                          console.log('Bash code executed', { stdout, stderr })
                          console.log('Setting supabase value')
                          return supabase.from('code_blocks').upsert({ hash, stdout, stderr })
                        })
                      )
                    }
                  }
                })
              }
            }
          },
        })

        lastChunk = chunk
        controller.enqueue(chunk)
      },
      async flush() {
        await opts.onFinal?.(self.promises)
      },
    })

    this.readable = this.transform.readable
    this.writable = this.transform.writable
  }
}

export const sandbox: Sandbox = {
  async init() {
    this.sbx = await CodeInterpreter.create()
  },
  autorun(opts: AutorunCallbacksAndOptions = DefaultAutorunCallbacksAndOptions) {
    return new SandboxAutorun(this.sbx!, opts)
  },
  close() {
    return this.sbx!.close()
  }
}
