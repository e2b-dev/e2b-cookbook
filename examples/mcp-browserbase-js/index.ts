import 'dotenv/config';
import Sandbox from 'e2b';
import { Agent, run, MCPServerStreamableHttp } from '@openai/agents';

async function runBrowserbaseExample() {
  console.log('Creating E2B sandbox with Browserbase MCP server...');
  
  // Create E2B sandbox with Browserbase MCP server
  const sandbox = await Sandbox.create({
    mcp: {
      browserbase: {
        apiKey: process.env.BROWSERBASE_API_KEY!,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        projectId: process.env.BROWSERBASE_PROJECT_ID!,
      },
    },
    timeoutMs: 600_000, // 10 minutes
  });

  const mcpUrl = sandbox.getMcpUrl();
  console.log(`Sandbox created with MCP URL: ${mcpUrl}`);

  // Set up MCP server connection
  const mcpServer = new MCPServerStreamableHttp({
    url: mcpUrl,
    name: 'E2B Browserbase Gateway',
    requestInit: {
      headers: {
        'Authorization': `Bearer ${await sandbox.getMcpToken()}`
      }
    },
    toolFilter: async (_, tool) => {
      console.log(`Calling tool: ${tool.name}`);
      return true;
    },
  });

  // Create OpenAI agent
  const agent = new Agent({
    name: 'Web Automation Assistant',
    model: 'gpt-4o', // Using gpt-4o for compatibility
    mcpServers: [mcpServer],
  });

  console.log('Connecting to MCP server...');
  await mcpServer.connect();
  console.log('Connected to MCP server successfully');

  console.log('Starting web automation task...');
  const taskPrompt = 'Make a screenshot of the e2b.dev landing page and tell me what it is about.';

  const result = await run(
    agent,
    taskPrompt,
    {
      stream: true,
    }
  );

  console.log('\nWeb Automation Results:');
  result
    .toTextStream({ compatibleWithNodeStreams: true })
    .pipe(process.stdout);

  await result.completed;
  console.log('\nWeb automation completed successfully!');

  // Cleanup
  console.log('\nClosing MCP server connection...');
  await mcpServer.close();
  console.log('MCP server closed successfully');
  
}

// Run the browserbase example
runBrowserbaseExample().catch((error) => {
  console.error('Failed to run browserbase example:', error);
  process.exit(1);
});
