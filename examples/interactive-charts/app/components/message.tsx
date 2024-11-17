"use client";
import { BotIcon } from "lucide-react";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ToolOutput } from "./tooloutput";
import { ToolResult } from "../lib/types";

// Simplified Message type since we only handle assistant messages
type Message = {
  id: string;
  content: string;
  toolInvocations?: ToolResult;
};

export function MessageComponent({ message }: { message: Message }) {
  return (
    <div className="px-4">
      <div className="flex gap-4 mx-auto w-full max-w-2xl py-4">
        <div className="h-fit rounded-md flex items-center justify-center">
          <BotIcon className="mt-1 w-6 h-6 text-orange-500" />
        </div>
        <div className="overflow-hidden flex-1 flex flex-col gap-2">
          <Markdown
            components={{
              code(props) {
                const { children, className, ...rest } = props;
                const match = /language-(\w+)/.exec(className || "");
                return match ? (
                  <SyntaxHighlighter
                    PreTag="div"
                    className="border text-sm !rounded-xl"
                    language={match[1]}
                    style={oneLight}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                ) : (
                  <code {...rest} className={className}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </Markdown>
          <ToolOutput result={message.toolInvocations} />
        </div>
      </div>
    </div>
  );
}