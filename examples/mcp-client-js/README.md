# MCP Client Connection

Connects to MCP servers in an E2B sandbox using the MCP SDK client.

## Setup

1. Install dependencies: `npm install`
2. Set environment variables in `.env`:
   - `E2B_API_KEY` - Get from [e2b.dev](https://e2b.dev/docs/getting-started/api-key)
3. Run: `npm run start`

## What it does

- Creates E2B sandbox with MCP servers
- Connects to MCP server using SDK client
- Lists available tools
- Cleans up resources