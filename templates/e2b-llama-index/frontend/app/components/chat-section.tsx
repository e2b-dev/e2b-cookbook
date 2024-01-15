"use client";

import { useChat } from "ai/react";
import { ChatInput, ChatMessages } from "./ui/chat";
import { CodeResultsContext } from '@/app/providers/CodeResults'
import { useContext, useState } from 'react'
import { CodeResults } from '@/app/components/ui/chat/chat.interface'
import { ChatIDContext } from '@/app/providers/ChatID'
import { API_URL } from '@/app/utils/constants'


export default function ChatSection() {
  const chatID = useContext(ChatIDContext)
  const {
    messages,
    input,
    isLoading,
    handleSubmit,
    handleInputChange,
    reload,
    stop,
  } = useChat(
    {
    api: API_URL,
    body: {
      "chat_id": chatID,
      "operation": "chat",
    },
  });
  const [codeResults, setCodeResults] = useState<CodeResults>({});

  return (
    <div className="space-y-4 max-w-5xl w-full">
      <CodeResultsContext.Provider value={ {codeResults, setCodeResults} }>
        <ChatMessages
          messages={messages}
          isLoading={isLoading}
          reload={reload}
          stop={stop}
        />
      </CodeResultsContext.Provider>
      <ChatInput
        input={input}
        handleSubmit={handleSubmit}
        handleInputChange={handleInputChange}
        isLoading={isLoading}
        multiModal={process.env.NEXT_PUBLIC_MODEL === "gpt-4-vision-preview"}
      />
    </div>
  );
}
