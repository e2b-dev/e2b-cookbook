import 'dotenv/config';
import Sandbox from 'e2b';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { alias } from './template';

async function runSandboxExample() {  
  // Create sandbox from custom template
  // Make sure the template is built first by running `npm run build`
  console.log('Creating sandbox from custom template...');
  const sandbox = await Sandbox.create(alias, {
    mcp: {
      browserbase: {
        apiKey: process.env.BROWSERBASE_API_KEY!,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        projectId: process.env.BROWSERBASE_PROJECT_ID!,
      },
      e2b: {
        apiKey: process.env.E2B_API_KEY!,
      }
    },
    timeoutMs: 600_000,
  });

  console.log('Sandbox created successfully');
  console.log(`MCP URL: ${sandbox.getMcpUrl()}`);

  // Create MCP client
  const client = new Client({
    name: 'e2b-custom-template-client',
    version: '1.0.0'
  });

  // Set up transport with authentication
  const transport = new StreamableHTTPClientTransport(
    new URL(sandbox.getMcpUrl()), 
    {
      requestInit: {
        headers: {
          'Authorization': `Bearer ${await sandbox.getMcpToken()}`
        }
      }
    }
  );

  console.log('Connecting to MCP server...');
  await client.connect(transport);
  console.log('Connected to MCP server successfully');

  // List available tools
  console.log('\nAvailable tools from custom template:');
  const tools = await client.listTools();
  
  if (tools.tools.length === 0) {
    console.log('No tools available from MCP server');
    console.log(`\nTotal tools available: ${tools.tools.length}`);
    return;
  }

  tools.tools.forEach((tool, index) => {
    console.log(`${index + 1}. ${tool.name}`);
    if (tool.description) {
      console.log(`   Description: ${tool.description}`);
    }
  });

  console.log(`\nTotal tools available: ${tools.tools.length}`);

}

runSandboxExample().catch((error) => {
  console.error('Failed to run example:', error);
  process.exit(1);
});
