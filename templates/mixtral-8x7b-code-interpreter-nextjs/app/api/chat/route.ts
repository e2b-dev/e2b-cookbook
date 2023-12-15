import { kv } from '@vercel/kv'
import { CodeInterpreter } from '@e2b/sdk'

export const runtime = 'edge'

const options = {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: `Bearer ${process.env.PPLX_API_KEY}`
  },
  body: JSON.stringify({
    model: 'mixtral-8x7b-instruct',
    messages: [
      { role: 'system', content: 'You are an AI developer. You have access to a safe cloud computer running Ubuntu. You can run python code, use terminal, use filesystem, and have access to the internet. Work inside the "/home/user" directory and always specify the full path when making filesystem operations.' },
      { role: 'user', content: 'Download this youtube video https://youtube.come/ https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      { role: 'assistant', content: 'Download this youtube video https://youtube.come/ https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    ]
  })
};


export async function POST(req: Request) {
  const json = await req.json()

  const sbx = await CodeInterpreter.create()
  await sbx.runPython('print("hello world")')


  // Keep sandbox alive for 10 minutes
  await sbx.keepAlive(10 * 60_000)
  await sbx.close()
}