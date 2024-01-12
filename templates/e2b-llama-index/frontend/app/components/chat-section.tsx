"use client";

import { useChat } from "ai/react";
import { ChatInput, ChatMessages } from "./ui/chat";
import { CodeBlocksContexts } from '@/app/providers/CodeResults'
import { useEffect, useState } from 'react'
import { CodeResults } from '@/app/components/ui/chat/chat.interface'

const API_URL = process.env.NEXT_PUBLIC_CHAT_API || "localhost:8000"

export default function ChatSection() {
  const chatID = crypto.randomUUID();
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
    api: "http://" + API_URL + `/chats/${chatID}`,
    headers: {
      "Content-Type": "application/json", // using JSON because of vercel/ai 2.2.26
    },
  });
  const [codeResults, setCodeResults] = useState<CodeResults>({});
  useEffect(() => {
    const ws = new WebSocket(`ws://${API_URL}/chats/${chatID}/ws`);
    ws.onopen = () => {
      console.log('Connected to WebSocket server');
    };
    ws.onmessage = (event) => {
      // Handle incoming messages
      const data = JSON.parse(event.data)
      console.log('Received message from server:', data)
      setCodeResults((prev) => ({ ...prev, [data.id]: data.output }))
    };
    ws.onclose = () => {
      console.log('Disconnected from WebSocket server');
    };
    return () => {
      ws.close();
    };
  }, []);
  return (
    <div className="space-y-4 max-w-5xl w-full">
      <CodeBlocksContexts.Provider value={ codeResults }>
        <ChatMessages
          messages={messages}
          isLoading={isLoading}
          reload={reload}
          stop={stop}
        />
      </CodeBlocksContexts.Provider>
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
