"use client";
import { useChat } from "ai/react";
import { Message } from 'ai';
import { MessageComponent } from "./components/message";
import { extractCodeFromText } from "./lib/code";
import { useEffect, useState } from "react";

export default function Home() {
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    messages,
    setMessages,
    append
  } = useChat({
    api: "/api/chat",
    onFinish: async (message: Message) => {
      setIsLoading(true);
      const code = extractCodeFromText(message.content);
      if (code) {
        const res = await fetch("/api/sandbox", {
          method: "POST",
          body: JSON.stringify({ code }),
        });

        const result = await res.json();

        message.toolInvocations = [
          {
            state: "result",
            toolCallId: message.id,
            toolName: "runCode",
            args: code,
            result,
          },
        ];

        setMessages((prev) => [...prev.slice(0, -1), message]);
      }
      setIsLoading(false);
    },
  });

  useEffect(() => {
    if (!hasInitialized) {
      append({
        content: "Please generate random dataset and visualize it with a bar chart",
        role: "user"
      });
      setHasInitialized(true);
    }
  }, [append, hasInitialized]);

  return (
    <div className="flex flex-col min-h-screen max-h-screen">
      <div className="flex-1 overflow-y-auto" id="messages">
        {messages.map((m) => (
          <MessageComponent key={m.id} message={m} />
        ))}
      </div>
    </div>
  );
}