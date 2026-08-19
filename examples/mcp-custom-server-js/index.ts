import 'dotenv/config';
import Sandbox from 'e2b';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function run() {
  console.log('Creating E2B sandbox with custom filesystem MCP server...');

  // Create E2B sandbox with custom MCP server from GitHub
  const sandbox = await Sandbox.create({
    mcp: {
      'github/modelcontextprotocol/servers': {
        installCmd: 'npm install',
        runCmd: 'npx -y @modelcontextprotocol/server-filesystem /root',
      },
    },
    timeoutMs: 600_000, // 10 minutes
  });

  console.log('Sandbox created successfully');
  console.log(`MCP URL: ${sandbox.getMcpUrl()}`);

  // Create MCP client
  const client = new Client({
    name: 'e2b-custom-server-client',
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

  console.log('Connecting to custom MCP server...');
  await client.connect(transport);
  console.log('Connected to custom MCP server successfully');

  // List available tools
  console.log('\nAvailable tools from custom filesystem MCP server:');
  const tools = await client.listTools();
  
  if (tools.tools.length === 0) {
    console.log('No tools available from custom MCP server');
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

  // Example: Use the filesystem tools if available
  console.log('\nTesting filesystem operations...');
  
  // Try to list files in the root directory
  const listFilesTool = tools.tools.find(tool => tool.name === 'list_directory');
  if (!listFilesTool) {
    console.log('list_directory tool not available');
    return;
  }

  console.log('Listing files in root directory...');
  const result = await client.callTool({
    name: 'list_directory',
    arguments: { path: '/' }
  });
  console.log('Directory contents:', result.content);

}

// Run the example
run().catch((error) => {
  console.error('Failed to run example:', error);
  process.exit(1);
});
