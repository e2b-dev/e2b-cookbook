# AgentKit Coding Agent with E2B Code Interpreter

This example demonstrates how to build an AI coding agent using AgentKit and E2B Code Interpreter. The agent can execute code and help with programming tasks.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the root of the project with the following environment variables:

```bash
E2B_API_KEY=your_e2b_api_key # Get one at https://e2b.dev/docs
ANTHROPIC_API_KEY=your_anthropic_api_key # Get one at https://console.anthropic.com/settings/keys
```

3. Start the development server:

```bash
npm run start "Create a Next.js TodoList demo and its associated unit tests. Finally run the tests with coverage"
```

## Features

- Code execution using E2B Code Interpreter
- Built with AgentKit for robust agent capabilities
- TypeScript support
- Hot reloading during development

## Project Structure

The project uses TypeScript and is set up with the following key dependencies:

- `@e2b/code-interpreter`: For code execution capabilities
- `@inngest/agent-kit`: For building the AI agent
- `zod`: For runtime type checking
- `typescript`: For static type checking
