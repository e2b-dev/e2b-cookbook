# Claude Code CLI with MCP

Integrates Claude Code CLI with MCP servers for research tasks.

## Setup

1. Install dependencies: `npm install`
2. Set environment variables in `.env`:
   ```
   E2B_API_KEY=your_e2b_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key
   ```
3. Run: `npm run start`

## What it does

- Creates E2B sandbox with arXiv and DuckDuckGo MCP servers
- Sets up Claude Code CLI with MCP server integration
- Runs research task (finds LLM papers and author info)
- Creates web page with results and hosts it