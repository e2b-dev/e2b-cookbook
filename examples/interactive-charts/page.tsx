"use client";
import { useEffect, useState } from "react";
import { MessageComponent } from "./components/message";
import { extractCodeFromText } from "./lib/code";

export default function Home() {
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAndProcess = async () => {
      try {
        // Initial LLM call to get code
        const prompt = "Please generate random dataset and visualize it with a bar chart";
        
        // Simulate initial LLM response - this will come from your backend
        const message = {
          id: "1",
          content: prompt,  // This will be replaced with LLM's response
          role: "assistant"
        };

        // Call sandbox with the code
        const code = extractCodeFromText(message.content);
        if (code) {
          const res = await fetch("/api/sandbox", {
            method: "POST",
            body: JSON.stringify({ code }),
          });

          const result = await res.json();

          // Add tool call result to the message
          message.toolInvocations = [{
            state: "result",
            toolCallId: message.id,
            toolName: "runCode",
            args: code,
            result,
          }];
        }

        setMessages([message]);
        setIsLoading(false);
      } catch (error) {
        console.error("Error:", error);
        setIsLoading(false);
      }
    };

    fetchAndProcess();
  }, []);

  return (
    <div className="flex flex-col min-h-screen max-h-screen">
      <div className="flex-1 overflow-y-auto" id="messages">
        {isLoading ? (
          <div className="p-4 text-center">Loading...</div>
        ) : (
          messages.map((m) => (
            <MessageComponent key={m.id} message={m} />
          ))
        )}
      </div>
    </div>
  );
}