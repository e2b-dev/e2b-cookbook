# Groq with Exa MCP Example

This example demonstrates how to use Groq's API with Exa MCP server through E2B to research recent AI developments.

## Features

- Connect to Exa MCP server for web search
- Use Groq's API for AI-powered research
- Research recent AI developments

## Prerequisites

- E2B API key
- Groq API key
- Exa API key

## Setup

1. Copy the environment template:
   ```bash
   cp env.template .env
   ```

2. Fill in your API keys in the `.env` file:
   ```
   E2B_API_KEY=your_e2b_api_key
   GROQ_API_KEY=your_groq_api_key
   EXA_API_KEY=your_exa_api_key
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

The example creates an E2B sandbox with Exa MCP server, then uses Groq's API to research what happened in AI recently, leveraging Exa for web search.

## Learn more

- [E2B Documentation](https://e2b.dev/docs)
- [Groq Documentation](https://console.groq.com/docs)
- [Exa Documentation](https://docs.exa.ai/)
