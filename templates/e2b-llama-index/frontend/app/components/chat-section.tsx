"use client";

import { useChat } from "ai/react";
import { ChatInput, ChatMessages, Message } from './ui/chat'
import { CodeResultsContext } from '@/app/providers/CodeResults'
import { useContext, useState } from 'react'
import { CodeResults } from '@/app/components/ui/chat/chat.interface'
import { ChatIDContext } from '@/app/providers/ChatID'
import { API_URL } from '@/app/utils/constants'
import { nanoid } from 'ai'


export default function ChatSection() {
  const chatID = useContext(ChatIDContext)
  const {
    messages,
    input,
    isLoading,
    handleSubmit,
    handleInputChange,
    reload,
    setMessages,
    stop,
  } = useChat(
    {
    id: chatID,
    api: `${API_URL}/chats/${chatID}`,
      initialInput:"Calculate the 13th Fibonacci number, but the series starts with 4 and 5",
  });
  const [codeResults, setCodeResults] = useState<CodeResults>({});

  const onFileUpload = async (file: File) => {
    setMessages([
      ...messages,
      {
        id: nanoid(),
        role: "system",
        content: `The user has uploaded file ${file.name}`,
      },
    ]);
  }

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
        onFileUpload={onFileUpload}
        isLoading={isLoading}
        multiModal={process.env.NEXT_PUBLIC_MODEL === "gpt-4-vision-preview"}
      />
    </div>
  );
}
