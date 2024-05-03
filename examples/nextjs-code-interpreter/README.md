# Next.js Code Interpreter

This example show how to use the E2B Code Interpreter API to run code in a Jupyter Notebook in a sandbox.

## Setup

1. Run `npm i`
2. Create a `.env` file in the root of the project and add the following environment variables:

```bash
E2B_API_KEY=your_e2b_api_key # Get one at https://e2b.dev/docs
OPENAI_API_KEY=your_openai_api_key
```

3. Run `npm run dev` to start the development server
4. Open the app in your browser at `http://localhost:3000`
5. Chat with the app and execute code with the `execute_python_code` connected to the LLM

## Code Interpreter

Code interpreter implementation is in [`app/api/chat/codeInterpreter.ts`](./app/api/chat/codeInterpreter.ts).

The `evaluateCode` method is the main method that takes the code to be executed and sessionID. Based on the `sessionID` it will try to reconnect to an existing sandbox or create a new one if it doesn't exist. After executing the code it will disconnect from the sandbox and call the `.keelAlive` method to ensure that the sandbox can be reused for the specified duration.
