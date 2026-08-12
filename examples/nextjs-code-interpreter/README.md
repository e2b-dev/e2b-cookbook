# Next.js app with LLM + Code Interpreter and streaming

This example shows how to use the E2B Code Interpreter to execute code in Next.js serverless functions.

![image](https://github.com/e2b-dev/e2b-cookbook/assets/5136688/aa68e50e-9110-41f9-92a7-9e85b1f8dbbc)


## Setup

1. Run `npm i`
2. Create a `.env` file in the root of the project and add the following environment variables:

```bash
E2B_API_KEY=your_e2b_api_key # Get one at https://e2b.dev/docs
OPENAI_API_KEY=your_openai_api_key
```

3. Run `npm run dev` to start the development server
4. Open the app in your browser at `http://localhost:3000`
5. Chat with the app and execute code with the `execute_python_code` tool connected to the LLM

## Code Interpreter

Code interpreter implementation is in [`app/api/chat/codeInterpreter.ts`](./app/api/chat/codeInterpreter.ts).

The `evaluateCode` method is the main method that takes Python `code` to be executed and `sessionID`. Based on the `sessionID` it will try to reconnect to an existing sandbox or create a new one if it doesn't exist.
After executing the code it will disconnect from the sandbox and call the `.keelAlive` method to ensure that the sandbox can be reused for the specified duration.

The code execution is stateful (using Jupyter Notebook underneath) and per session — you can refer to variables from the previous execution, define functions that you will use later, etc.

## Known limitation: Vercel AI SDK version

This example is still on Vercel AI SDK v3 (`ai@^3.1.1`, `@ai-sdk/openai@^0.0.9`) and therefore
pins `openai@^4.42.0` to satisfy that peer range, while the rest of the cookbook is on `openai@^7`.

Moving to AI SDK v5+ is a rewrite rather than a bump: `OpenAIStream`, `StreamingTextResponse`,
`ToolCallPayload`, `experimental_onToolCall` and `appendToolCallMessage` are all gone, replaced by
`streamText` plus `toUIMessageStreamResponse()`, and the `useChat` client in `app/page.tsx` changes
with it. That needs to be done and then actually run in a browser, so it belongs in its own PR.
