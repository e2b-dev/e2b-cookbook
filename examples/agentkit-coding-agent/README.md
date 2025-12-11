# AgentKit Coding Agent with E2B Code Interpreter

This example demonstrates how to build an AI coding agent using AgentKit and E2B Code Interpreter. The agent can execute code and help with programming tasks.

https://github.com/user-attachments/assets/4aaf784a-f6da-4327-b3f6-01573b57f1a0

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the root of the project with the following environment variables:

```bash
E2B_API_KEY=your_e2b_api_key # Get one at https://e2b.dev/docs
ANTHROPIC_API_KEY=your_anthropic_api_key # Get one at https://console.anthropic.com/settings/keys

# Optional: Specify which Claude model to use (defaults to claude-haiku-4-5)
# All models: https://console.anthropic.com/docs/en/about-claude/models/overview
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
```

3. Start the Inngest Dev Server:

```bash
npx inngest-cli@latest dev
```

4. Start the program:

```bash
npm run start
```

5. Open the Inngest Dev Server at [http://127.0.0.1:8288/functions](http://127.0.0.1:8288/functions)

<img src="./readme-assets/inngest-functions-list.png" height="250">

6. Trigger the Coding Agent with the following input:

```json
{
  "data": {
    "input": "Create a Next.js TodoList demo and its associated unit tests. Save the contents into /tmp/todolist-demo/. Finally run the tests with coverage"
  }
}
```

<img src="./readme-assets/inngest-trigger-coding-agent.png" height="300">

7. The agent will start executing the task and you will see the output in the Inngest Dev Server.

<img src="./readme-assets/inngest-coding-agent-run.png" height="450">

## Features

- Code execution using E2B Code Interpreter
- Built with AgentKit for robust agent capabilities
- TypeScript support
- Hot reloading during development
- Durable execution (retries on rate limits, etc) with Inngest
- **Context Window Management** - Handles long conversations without hitting token limits
- **Smart Error Handling** - Validates model names and provides helpful error messages

## Project Structure

The project uses TypeScript and is set up with the following key dependencies:

- `@e2b/code-interpreter`: For code execution capabilities
- `@inngest/agent-kit`: For building the AI agent
- `zod`: For runtime type checking
- `typescript`: For static type checking

## Context Window Management

This agent includes automatic output truncation to prevent large outputs from bloating the conversation context:

### Automatic Output Truncation
- **Terminal commands**: Output truncated to 15,000 characters
- **File reads**: Individual files limited to 20,000 characters, batch reads to 50,000 characters
- **Code execution**: Output truncated to 10,000 characters

### Configuration
Adjust limits in `src/contextManager.ts`:
```typescript
export const CONTEXT_CONFIG = {
  MAX_TERMINAL_OUTPUT: 15000,
  MAX_FILE_CONTENT: 20000,
  MAX_TOTAL_FILE_CONTENT: 50000,
  MAX_CODE_OUTPUT: 10000,
};
```
