# Custom E2B Template

Creates a custom E2B template with pre-installed MCP servers for faster startup.

## Setup

1. Install dependencies: `npm install`
2. Set environment variables in `.env`:
   ```
   E2B_API_KEY=your_e2b_api_key
   BROWSERBASE_API_KEY=your_browserbase_api_key
   BROWSERBASE_PROJECT_ID=your_browserbase_project_id
   GEMINI_API_KEY=your_gemini_api_key
   ```
3. Build the template: `npm run build`
4. Run: `npm run start`

## What it does

- Creates custom E2B template with pre-installed MCP servers
- Builds template with Browserbase and E2B MCP servers
- Creates sandbox from custom template
- Lists available tools from pre-installed servers
