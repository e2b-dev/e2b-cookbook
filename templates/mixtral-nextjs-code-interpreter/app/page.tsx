'use client'
import React from 'react'
import { useChat } from 'ai/react'
import 'highlight.js/styles/atom-one-dark.css'
import { createClient } from '@supabase/supabase-js'

import { SupabaseProvider } from '@/hooks/useSupabase'
import { Markdown } from '@/components/Markdown'
import { InputForm } from '@/components/InputForm'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_KEY as string,
)


export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    initialInput: 'calculate pi using monte carlo method',
  })

  const isWaitingForFirstChunk = messages[messages.length - 1]?.role === 'user'
  return (
    <SupabaseProvider value={supabase}>
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
                    >
                      <Markdown markdown={m.content} />
                    </div>
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

        <InputForm
          handleSubmit={handleSubmit}
          handleInputChange={handleInputChange}
          input={input}
        />
      </div >
    </SupabaseProvider>
  );
}