# MCP Research Agent

OpenAI agent that uses arXiv and DuckDuckGo MCP servers for research tasks.

## Setup

1. Install dependencies: `npm install`
2. Set environment variables in `.env`:
   - `E2B_API_KEY` - Get from [e2b.dev](https://e2b.dev/docs/getting-started/api-key)
   - `OPENAI_API_KEY` - Get from [OpenAI](https://platform.openai.com/settings)
3. Run: `npm run start`

## What it does

- Creates E2B sandbox with arXiv and DuckDuckGo MCP servers
- Sets up OpenAI agent with MCP integration
- Performs research task (finds LLM papers and author info)
- Streams results to console