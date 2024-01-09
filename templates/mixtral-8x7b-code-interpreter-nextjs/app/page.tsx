'use client'
import React from 'react'
import { useChat } from 'ai/react'
import { Marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'

const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang, info) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  }),
)

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, data } = useChat();
  console.log('messages', messages)
  console.log('data', data)
  const isWaitingForFirstChunk = messages[messages.length - 1]?.role === 'user'
  return (
    <div className="flex flex-col items-center justify-start overflow-hidden max-h-full w-full h-full gap-2">
      <div className="flex-1 w-full flex flex-col gap-2 overflow-y-auto overflow-x-hidden pt-8">
        <div className="flex flex-col mx-auto gap-2 w-full max-w-2xl">
          {messages.map((m, idx) => (
            <>
              {m.role === "user" ? (
                <div
                  key={m.id}
                  className={'py-1 px-4 border bg-blue-50 flex items-center justify-between'}
                >
                  <span className="text-gray-400 font-bold">{`>`}</span>
                  <span className="flex-1 text-right">{m.content}</span>
                </div>
              ) : (
                <React.Fragment key={m.id}>
                  {/* Show loading indicator only for the last message */}
                  {idx === messages.length - 1 && isLoading && (
                    <span className="relative flex h-4 w-4 top-4 right-[6px]">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-orange-400/60"></span>
                    </span>
                  )}
                  <div
                    className="py-1 px-4 border w-full min-h-[120px]"
                    dangerouslySetInnerHTML={{ __html: marked.parse(m.content) }}
                  />
                </React.Fragment>
              )}
            </>
          ))}
          {isWaitingForFirstChunk && (
            <>
              <span className="relative flex h-4 w-4 top-4 right-[6px]">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-orange-400/60"></span>
              </span>
              <div
                className="py-1 px-4 border w-full min-h-[120px]"
              />
            </>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-2xl flex align-center justify-between gap-2 relative mb-8">
        <input
          className="flex-1 border border-gray-300 rounded p-2 w-full pl-8 outline-none"
          value={input}
          onChange={handleInputChange}
          placeholder="Ask AI Developer..."
          autoFocus
        />
        <span className="text-gray-400 font-bold absolute left-4 top-1/2 -translate-y-1/2">{`>`}</span>
        <button type="submit" className="absolute top-0 left-[calc(100%+8px)] bottoms-0 border border-gray-300 rounded p-2">Send</button>
      </form>
    </div>
  );
}