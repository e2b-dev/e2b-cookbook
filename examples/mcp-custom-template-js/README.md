# Custom E2B Template

Creates a custom E2B template with pre-installed MCP servers for faster startup.

## Setup

1. Install dependencies: `npm install`
2. Set environment variables in `.env`:
   - `E2B_API_KEY` - Get from [e2b.dev](https://e2b.dev/docs/getting-started/api-key)
   - `BROWSERBASE_API_KEY` - Get from [browserbase.com](https://browserbase.com/)
   - `GEMINI_API_KEY` - Get from [ai.google.dev](https://ai.google.dev/)
   - `BROWSERBASE_PROJECT_ID` - Get from [browserbase.com](https://browserbase.com/)
3. Run: `npm run start`

## What it does

- Creates custom E2B template with pre-installed MCP servers
- Builds template with Browserbase and E2B MCP servers cached
- Creates sandbox from custom template
- Lists available tools from pre-installed servers