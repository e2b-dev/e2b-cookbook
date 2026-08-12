'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, generateId, type UIMessage } from 'ai';

import Spinner from './Spinner';

// What the execute_python_code tool returns from app/api/chat/route.ts.
interface CodeInterpreterOutput {
  code: string;
  stdout: string[];
  stderr: string[];
  error?: {
    traceback: string;
    name: string;
    value: string;
  };
  results: string[];
}

function ToolResult({ output }: { output: CodeInterpreterOutput }) {
  return (
    <div className="flex flex-col border-blue-400 border rounded-md p-2 mb-4 space-y-1 text-blue-700">
      <strong>execute_python_code:</strong>
      <pre className="whitespace-pre-wrap">{output.code}</pre>
      {output.stdout.length > 0 && <div>Stdout: {output.stdout.join('\n')}</div>}
      {output.stderr.length > 0 && <div>Stderr: {output.stderr.join('\n')}</div>}
      {output.error && (
        <div>
          <div>Error Name: {output.error.name}</div>
          <div>Error Value: {output.error.value}</div>
          <div>Error Traceback:</div>
          <pre className="whitespace-pre-wrap">{output.error.traceback}</pre>
        </div>
      )}
      {output.results.length > 0 && (
        <>
          <div>Results:</div>
          <pre className="whitespace-pre-wrap">{output.results.join('\n')}</pre>
        </>
      )}
    </div>
  );
}

const roleToColorMap: Record<UIMessage['role'], string> = {
  system: 'red',
  user: 'black',
  assistant: 'green',
};

export default function Chat() {
  const [sessionID] = useState(() => generateId());
  const [input, setInput] = useState('');

  // v5 moved transport config out of useChat's top level and dropped the
  // built-in input state, so the textbox is plain React state now.
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { sessionID },
    }),
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map((message) => (
        <div
          key={message.id}
          className="whitespace-pre-wrap"
          style={{ color: roleToColorMap[message.role] }}
        >
          <strong>{`${message.role}: `}</strong>
          {/* A v5 message is a list of parts: text, tool calls, reasoning. */}
          {message.parts.map((part, i) => {
            if (part.type === 'text') {
              return <span key={i}>{part.text}</span>;
            }
            if (part.type === 'tool-execute_python_code') {
              if (part.state === 'output-available') {
                return (
                  <ToolResult
                    key={i}
                    output={part.output as CodeInterpreterOutput}
                  />
                );
              }
              if (part.state === 'output-error') {
                return (
                  <div key={i} className="text-red-600">
                    Tool error: {part.errorText}
                  </div>
                );
              }
              return (
                <div key={i} className="text-blue-400">
                  Running code...
                </div>
              );
            }
            return null;
          })}
          <br />
          <br />
        </div>
      ))}

      <div id="chart-goes-here"></div>

      {isLoading && (
        <div className="fixed bottom-24 flex justify-center w-full max-w-md">
          <Spinner />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput('');
        }}
      >
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
