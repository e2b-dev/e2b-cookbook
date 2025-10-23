# MCP Research Agent

OpenAI agent that uses arXiv and DuckDuckGo MCP servers for research tasks.

## Setup

1. Install dependencies: `npm install`
2. Set environment variables in `.env`:
   ```
   E2B_API_KEY=your_e2b_api_key
   OPENAI_API_KEY=your_openai_api_key
   ```
3. Run: `npm run start`

## What it does

- Creates E2B sandbox with arXiv and DuckDuckGo MCP servers
- Sets up OpenAI agent with MCP integration
- Performs research task (finds LLM papers and author info)
- Streams results to console