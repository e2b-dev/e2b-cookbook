# Custom MCP Server

Uses a custom filesystem MCP server from GitHub in an E2B sandbox.

## Setup

1. Install dependencies: `npm install`
2. Set environment variables in `.env`:
   ```
   E2B_API_KEY=your_e2b_api_key
   ```
3. Run: `npm run start`

## What it does

- Creates E2B sandbox with custom filesystem MCP server
- Installs and runs the filesystem MCP server
- Connects to MCP server using SDK client
- Lists available tools and demonstrates filesystem operations