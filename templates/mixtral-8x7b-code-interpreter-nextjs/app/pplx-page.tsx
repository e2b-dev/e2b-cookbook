'use client'

import CodeBlockComponent from '@/components/CodeBlock'
import { useEffect, useState } from 'react'

interface CodeBlock {
  type: 'language-py' | 'language-sh'
  code: string
  out: { text: string, timestamp: number }[]
}

interface Message {
  role: 'user' | 'assistant',
  content: string,
  timestamp: number,
  codeBlocks?: CodeBlock[],
}

export default function Home() {
  const [input, setInput] = useState<string>('What is the price of bitcoin? Use CoinDesk API that doesn\'t need an API key.')
  const [messages, setMessages] = useState<Message[]>([])

  useEffect(function hitChat() {
  }, [])

  async function handleSend(message: string) {
    const newMessages = [...messages, { role: 'user', content: message, timestamp: Date.now() }]
    setMessages(newMessages as Message[])
    setInput('')

    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
      }),
    })

    const data = await res.json()
    console.log('data', data)
    // const codeBlocks = data.codeBlocks.map()
    setMessages(m => [
      ...m,
      { role: 'assistant', content: data.response, timestamp: Date.now(), codeBlocks: data.codeBlocks },
    ])
    if (data.codeBlocks) {
      data.codeBlocks.map((codeBlock: CodeBlock) => {
        const codeOutput = codeBlock.out.map((out) => out.text).join('\n')
        return {
          role: 'assistant',
          text: codeOutput,
          timestamp: codeBlock.out[0].timestamp,
        }
      })
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-start justify-start">
      <nav className="w-full flex justify-start items-start border-b p-2 space-y-4 bg-zinc-100 border border-zinc-300">
        <h1 className="text-sm font-medium text-zinc-600">Mixtral 8x7b Code Interpreter</h1>
      </nav>

      <div className="flex-1 w-full flex flex-col items-start justify-start py-8 px-16 gap-4">
        <div className="w-full flex flex-col items-start rounded border p-6 space-y-4 border border-zinc-300 bg-zinc-100">
          What should I do?
        </div>

        {messages.map((message) => (
          <>
            {message.role === 'assistant' && (
              <div key={message.timestamp} className="w-full flex flex-col items-start rounded border p-6 space-y-4 border border-zinc-300 bg-zinc-100 whitespace-pre-line text-sm">
                {message.content}

                <div className="flex flex-col items-start justify-start gap-4">
                  {message.codeBlocks?.map((codeBlock) => (
                    <CodeBlockComponent key={codeBlock.code} codeBlock={codeBlock} />
                  ))}
                </div>
              </div>
            )}
            {message.role === 'user' && (
              <div key={message.timestamp} className="w-full flex flex-col items-end rounded border p-6 space-y-4 border border-zinc-300 bg-zinc-100 text-sn">
                {message.content}
              </div>
            )}
          </>
        ))}
      </div>


      <div className="py-4 px-24 flex justify-between gap-2 w-full">
        <input className="border border-zinc-400 appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button
          className="text-zinc-500 py-2 px-4 rounded border border-zinc-400" type="button"
          onClick={() => handleSend(input)}
        >
          Send
        </button>
      </div>
    </main>
  )
}
