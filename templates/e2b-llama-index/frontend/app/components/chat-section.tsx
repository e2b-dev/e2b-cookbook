"use client";

import { useChat } from "ai/react";
import { ChatInput, ChatMessages, Message } from './ui/chat'
import { CodeResultsContext } from '@/app/providers/CodeResults'
import { useContext, useState } from 'react'
import { CodeResults } from '@/app/components/ui/chat/chat.interface'
import { ChatIDContext } from '@/app/providers/ChatID'
import { API_URL } from '@/app/utils/constants'
import { nanoid } from 'ai'


const initialData = [
  {
    id: "1",
    role: "user" as 'user' | 'assistant',
    content: "What's the 40th fibonacci number if the series starts with 7,8, use python"
  },
  {
    id: "2",
    role: "assistant" as 'user' | 'assistant',
    content: "To find the 40th Fibonacci number, we can use a loop to calculate each Fibonacci number in the series. We'll start with the given initial values of 7 and 8, and then calculate the subsequent numbers by summing the previous two numbers.\n\nHere's the code snippet to find the 40th Fibonacci number:\n\n```python {\"id\": \"52d43df9-4f58-4444-baac-e33eaf73504f\"}\ndef fibonacci(n):\n    if n <= 0:\n        return \"Invalid input. Please enter a positive integer.\"\n    elif n == 1:\n        return 7\n    elif n == 2:\n        return 8\n    else:\n        fib_prev = 7\n        fib_current = 8\n        for _ in range(3, n+1):\n            fib_next = fib_prev + fib_current\n            fib_prev = fib_current\n            fib_current = fib_next\n        return fib_current\n\nfib_40 = fibonacci(40)\nprint(fib_40)\n```\n\nWhen you execute this code, it will calculate and print the 40th Fibonacci number, which is the answer to your question."
  },
]

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
      initialMessages: initialData
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
