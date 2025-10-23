import 'dotenv/config';
import Sandbox from 'e2b';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function run() {
  console.log('Creating E2B sandbox with MCP servers...');
  
  let sandbox: Sandbox | null = null;
  
  try {
    // Create E2B sandbox with MCP servers
    sandbox = await Sandbox.create({
      mcp: {
        remote: {}
      },
      timeoutMs: 600_000, // 10 minutes
    });

    console.log('Sandbox created successfully');
    console.log(`MCP URL: ${sandbox.getMcpUrl()}`);

    // Create MCP client
    const client = new Client({
      name: 'e2b-mcp-client',
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
    console.log('\nAvailable MCP tools:');
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

  } catch (error) {
    console.error('Error occurred:', error);
    throw error;
  } finally {
    // Cleanup
    if (sandbox) {
      console.log('\nCleaning up sandbox...');
      await sandbox.kill();
      console.log('Sandbox closed successfully');
    }
  }
}

// Run the example
run().catch((error) => {
  console.error('Failed to run example:', error);
  process.exit(1);
});
