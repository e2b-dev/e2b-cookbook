# Browserbase MCP Example

This example demonstrates how to use the Browserbase MCP server with E2B to create a web automation agent that can take screenshots and interact with web pages.

## Features

- Connect to Browserbase MCP server through E2B
- Use OpenAI Agents to automate web tasks
- Take screenshots of web pages
- Stream results in real-time

## Prerequisites

- E2B API key
- Browserbase API key
- Gemini API key (for Browserbase)
- Browserbase project ID
- OpenAI API key

## Setup

1. Copy the environment template:
   ```bash
   cp env.template .env
   ```

2. Fill in your API keys in the `.env` file:
   ```
   E2B_API_KEY=your_e2b_api_key
   BROWSERBASE_API_KEY=your_browserbase_api_key
   GEMINI_API_KEY=your_gemini_api_key
   BROWSERBASE_PROJECT_ID=your_browserbase_project_id
   OPENAI_API_KEY=your_openai_api_key
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run the example:
   ```bash
   npm start
   ```

## What it does

The example creates an E2B sandbox with the Browserbase MCP server, connects an OpenAI Agent to it, and then asks the agent to take a screenshot of the E2B landing page and describe what it's about.

## Learn more

- [E2B Documentation](https://e2b.dev/docs)
- [Browserbase Documentation](https://browserbase.com)
- [OpenAI Agents Documentation](https://platform.openai.com/docs/agents)
