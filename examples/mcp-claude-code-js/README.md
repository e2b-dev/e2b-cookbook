# Claude Code CLI with MCP

Integrates Claude Code CLI with MCP servers for research tasks.

## Setup

1. Install dependencies: `npm install`
2. Set environment variables in `.env`:
   - `E2B_API_KEY` - Get from [e2b.dev](https://e2b.dev/docs/getting-started/api-key)
   - `ANTHROPIC_API_KEY` - Get from [console.anthropic.com](https://console.anthropic.com/)
3. Run: `npm run start`

## What it does

- Creates E2B sandbox with arXiv and DuckDuckGo MCP servers
- Sets up Claude Code CLI with MCP server integration
- Runs research task (finds LLM papers and author info)
- Creates web page with results and hosts it