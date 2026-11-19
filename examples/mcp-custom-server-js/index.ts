import 'dotenv/config';
import Sandbox from 'e2b';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const COLD_START_TIMEOUT_MS = 180_000;

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

  try {
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

    // The first request waits until the gateway has cloned the repository,
    // run installCmd and started the server, which can take over a minute.
    // The MCP SDK's default request timeout is 60 seconds, so raise it.
    console.log('\nAvailable tools from custom filesystem MCP server:');
    const tools = await client.listTools(undefined, { timeout: COLD_START_TIMEOUT_MS });

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

    // The gateway prefixes tool names with the server name,
    // e.g. "github/modelcontextprotocol/servers-list_directory".
    const listFilesTool = tools.tools.find(tool => tool.name.endsWith('list_directory'));
    if (!listFilesTool) {
      console.log('list_directory tool not available');
      return;
    }

    // The server only allows access to /root, the directory passed in runCmd.
    console.log('Listing files in /root...');
    const result = await client.callTool(
      {
        name: listFilesTool.name,
        arguments: { path: '/root' }
      },
      undefined,
      { timeout: COLD_START_TIMEOUT_MS }
    );
    console.log('Directory contents:', result.content);

    await client.close();
  } finally {
    // Cleanup
    console.log('\nCleaning up sandbox...');
    await sandbox.kill();
    console.log('Sandbox closed successfully');
  }
}

// Run the example
run().catch((error) => {
  console.error('Failed to run example:', error);
  process.exit(1);
});
