import * as markedpkg from 'marked'
import * as htmlparser from 'htmlparser2'
import { kv } from '@vercel/kv'
import { CodeInterpreter } from '@e2b/sdk'

export const runtime = 'edge'

const TTL = 10 * 60_000 // 10 minutes
const marked = markedpkg.marked

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface CodeBlock {
  type: 'language-py' | 'language-sh'
  code: string
  out: { text: string, timestamp: number }[]
}

async function parseMarkdown(sbx: CodeInterpreter, mdString: string) {
  // console.log('mdString', mdString)
  const htmlString = await marked(mdString);
  // console.log('htmlString', htmlString)


  return new Promise<CodeBlock[]>((resolve, reject) => {
    let isParsingCode = false
    let codeType = ''
    let code = ''
    const codeBlocks: CodeBlock[] = []

    const parser = new htmlparser.Parser({
      onopentag: async function (name, attribs) {
        // console.log('\nParsing:', name, attribs)

        if (name === 'code') {
          isParsingCode = true
          codeType = attribs.class
        }
      },
      ontext: function (text) {
        if (isParsingCode) {
          code += text
        }
      },
      onclosetag: function (tagname) {
        if (tagname === 'code') {
          isParsingCode = false
          codeBlocks.push({ type: codeType as 'language-py' | 'language-sh', code, out: [] })
        }
      },
      onend: function () {
        resolve(codeBlocks)
      },
      onerror: function (err) {
        reject(err)
      },
    })
    parser.write(htmlString)
    parser.end()
  })
}

function mistralMessages(newMessages: Message[]): Message[] {
  return [
    { role: 'system', content: 'You are a skileld AI developer that does not make typos and basic mistakes. You have access to a safe cloud computer running Ubuntu. You can run python code, use terminal, use filesystem, and have access to the internet. Work inside the "/home/user" directory and always specify the full path when making filesystem operations. Always respond in markdown and always specify whether the code block is python or shell by using `py` and `sh`.' },
    { role: 'user', content: 'Download this youtube videohttps://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    {
      role: 'assistant', content: `First install youtube-dl
\`\`\`sh
apt get install youtube-dl
\`\`\`

Now we can use youtube-dl to download the video
\`\`\`sh
youtube-dl -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4' -o '/home/user/video.mp4' 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
\`\`\``,
    },
    {
      role: 'user', content: 'What is the current price of Bitcoin?',
    },
    {
      role: 'assistant', content: `In order to get the current price of Bitcoin, you can use the following Python code, which utilizes the CoinDesk API
\`\`\`py
import requests
response = requests.get('https://api.coindesk.com/v1/bpi/currentprice.json')
data = response.json()
print(data["bpi"]["USD"]["rate"])
\`\`\``,
    },
    ...newMessages,
  ]
}


async function askMistral(messages: Message[]) {
  const options = {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.PPLX_API_KEY}`
    },
    body: JSON.stringify({
      model: 'mixtral-8x7b-instruct',
      messages,
    })
  }

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', options)
    const json = await res.json()
    if (!json.choices || json.choices.length === 0) return json
    return json.choices[0]
  } catch (err) {
    console.error(err)
  }
}


export async function POST(req: Request) {
  const json = await req.json()
  const { messages } = json
  console.log('message:', messages)


  const sandboxID = await kv.hget<string | undefined>('sandbox', 'id')
  const lastUsed = await kv.hget<number | undefined>('sandbox', 'lastUsed')

  let sbx: CodeInterpreter
  const now = Date.now()
  if (sandboxID && lastUsed && now - lastUsed < TTL) {
    console.log('Reconnecting to sandbox:', sandboxID)
    sbx = await CodeInterpreter.reconnect(sandboxID)
  } else {
    console.log('Creating new sandbox...')
    sbx = await CodeInterpreter.create({
      logger: console,
    })
    console.log('Created sandbox:', sbx.id)
    await kv.hset('sandbox', { id: sbx.id })
  }

  console.log('Asking mistral..')
  const response = await askMistral(mistralMessages(messages))
  console.log(response)
  if (!response.message?.content) {
    console.error(response)
    return new Response(JSON.stringify({
      response: 'Mistral did not return a message',
    }), {
      status: 500,
    })
  }
  const mistralMessage = response.message.content
  console.log('Mistral response:', mistralMessage)

  const codeBlocks = await parseMarkdown(sbx, mistralMessage)
  for (const block of codeBlocks) {
    const { type, code } = block
    console.log('block', block)
    if (type === 'language-py') {
      console.log('Running code in sandbox...')
      const { stdout, stderr } = await sbx.runPython(code, {
        onStdout: out => { block.out.push({ text: out.line, timestamp: Date.now() }) },
        onStderr: out => { block.out.push({ text: out.line, timestamp: Date.now() }) },
      })
      console.log('sdout', stdout)
      console.log('stderr', stderr)
    } else if (type === 'language-sh') {
      console.log('Running code in sandbox...')
      const { stdout, stderr } = await sbx.process.startAndWait(
        {
          cmd: code,
          onStdout: out => { block.out.push({ text: out.line, timestamp: Date.now() }) },
          onStderr: out => { block.out.push({ text: out.line, timestamp: Date.now() }) },
        }
      )
      console.log('sdout', stdout)
      console.log('stderr', stderr)
    } else {
      console.warn('Unknown language', type)
    }
  }

  // Keep sandbox alive for 10 minutes
  await kv.hset('sandbox', { lastUsed: now })
  await sbx.keepAlive(TTL)
  await sbx.close()

  return new Response(JSON.stringify({
    response: mistralMessage,
    codeBlocks,
  }), {
    status: 200,
  })
}