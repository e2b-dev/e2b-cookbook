"use client";
import { useChat } from "ai/react";
import { MessageComponent } from "./components/message";
import { extractCodeFromText } from "./lib/code";
import { useEffect, useState } from "react";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);

  const {
    messages,
    setMessages,
  } = useChat({
    onFinish: async (message) => {
      const code = extractCodeFromText(message.content);
      if (code) {
        const res = await fetch("/api/sandbox", {
          method: "POST",
          body: JSON.stringify({ code }),
        });

        const result = await res.json();

        // add tool call result to the last message
        message.toolInvocations = [
          {
            state: "result",
            toolCallId: message.id,
            toolName: "runCode",
            args: code,
            result,
          },
        ];

        setMessages((prev) => {
          // replace last message with the new message
          return [...prev.slice(0, -1), message];
        });
      }

      setIsLoading(false);
    },
  });

  // Auto-trigger on page load
  useEffect(() => {
    setIsLoading(true);
    setMessages([{
      id: "1",
      content: "Please generate random dataset and visualize it with a bar chart",
      role: "assistant"
    }]);
  }, []);

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