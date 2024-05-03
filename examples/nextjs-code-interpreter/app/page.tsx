'use client';

import { useState } from 'react';
import { generateId } from 'ai';
import { Message, useChat } from 'ai/react';
import Spinner from './Spinner';

// Specific to the e2b code interpreter
interface ToolCallResult {
  messageIdx: number;
  tool_call_id: string;
  function_name: string;
  parameters: {
    code: string;
  };
  evaluation: {
    stdout: string[];
    stderr: string[];
    error?: {
      traceback: string;
      name: string;
      value: string;
    };
    results: any[];
  };
}

function ToolResult({ toolCallResult }: { toolCallResult: ToolCallResult }) {
  return (
    <div className="flex flex-col border-blue-400 border rounded-md p-2 mb-4 space-y-1 text-blue-700">
      <strong>{toolCallResult.function_name}:</strong>
      <pre>{toolCallResult.parameters.code}</pre>
      {toolCallResult.evaluation.stdout.length > 0 && <div>Stdout: {toolCallResult.evaluation.stdout.join('\n')}</div>}
      {toolCallResult.evaluation.stderr.length > 0 && <div>Stderr: {toolCallResult.evaluation.stderr.join('\n')}</div>}
      {toolCallResult.evaluation.error && (
        <div>
          <div>Error Name: {toolCallResult.evaluation.error.name}</div>
          <div>Error Value: {toolCallResult.evaluation.error.value}</div>
          <div>Error Traceback:</div>
          <pre>{toolCallResult.evaluation.error.traceback}</pre>
        </div>
      )}
      {toolCallResult.evaluation.results.length > 0 && <div>Results:</div>}
      {toolCallResult.evaluation.results.length > 0 && <pre>{JSON.stringify(toolCallResult.evaluation.results, null, 2)}</pre>}
    </div>
  );
}

export default function Chat() {
  const [sessionID] = useState(generateId(4));

  const { messages, input, handleInputChange, handleSubmit, data, isLoading } = useChat({
    api: '/api/chat',
    body: {
      sessionID,
    },
  });

  const toolCallsResults = data ? (data as unknown as ToolCallResult[]) : [];

  // Generate a map of message role to text color
  const roleToColorMap: Record<Message['role'], string> = {
    system: 'red',
    user: 'black',
    function: 'blue',
    tool: 'purple',
    assistant: 'green',
    data: 'orange',
  };

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.length > 0
        ? messages.map((m: Message, i) => (
          <div
            key={m.id}
            className="whitespace-pre-wrap"
            style={{ color: roleToColorMap[m.role] }}
          >
            {toolCallsResults.filter(t => t.messageIdx === i).map(t => (
              <ToolResult key={t.tool_call_id} toolCallResult={t} />
            ))}
            <strong>{`${m.role}: `}</strong>
            {m.content || JSON.stringify(m.tool_calls)}
            <br />
            <br />
          </div>
        ))
        : null}
      <div id="chart-goes-here"></div>
      {isLoading && <div className="fixed bottom-24 flex justify-center w-full max-w-md"><Spinner /></div>}
      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}