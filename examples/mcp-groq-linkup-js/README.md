# Groq with Linkup MCP Example

This example demonstrates how to use Groq's API with the [Linkup MCP server](https://github.com/LinkupPlatform/linkup-mcp-server) through E2B to research recent AI developments.

## Features

- Run the Linkup MCP server from GitHub inside an E2B sandbox
- Use Groq's API for AI-powered research
- Research recent AI developments with real-time, sourced web search

## Prerequisites

- E2B API key
- Groq API key
- Linkup API key (get one at [app.linkup.so](https://app.linkup.so))

## Setup

1. Copy the environment template:
   ```bash
   cp env.template .env
   ```

2. Fill in your API keys in the `.env` file:
   ```
   E2B_API_KEY=your_e2b_api_key
   GROQ_API_KEY=your_groq_api_key
   LINKUP_API_KEY=your_linkup_api_key
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

The example creates an E2B sandbox that installs and runs the Linkup MCP server from GitHub, then uses Groq's API to research what happened in AI recently, leveraging Linkup's `linkup-search` and `linkup-fetch` tools for web search and page fetching.

## Learn more

- [E2B Documentation](https://e2b.dev/docs)
- [E2B MCP Gateway](https://e2b.dev/docs/mcp)
- [Groq Documentation](https://console.groq.com/docs)
- [Linkup Documentation](https://docs.linkup.so/)
