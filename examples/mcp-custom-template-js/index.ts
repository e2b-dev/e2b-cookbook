import 'dotenv/config';
import { Sandbox } from "e2b";
import { Template } from "e2b";
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function runCustomTemplateExample() {
  console.log('Creating custom E2B template with pre-installed MCP servers...');
  
  const alias = "browserbase-mcp-gateway";
  let sandbox: Sandbox | null = null;
  
  try {
    // Create custom template with pre-installed MCP servers
    console.log('Building custom template...');
    const template = Template()
      .fromTemplate("mcp-gateway")
      // This will cache the browserbase server docker image in the template, speeding up the listTools call during runtime
      .addMcpServer(["browserbase", 'e2b']);

    await Template.build(template, {
      alias,
      cpuCount: 8,
      memoryMB: 8192,
      onBuildLogs: console.log,
    });

    console.log('Custom template built successfully');

    // Create sandbox from custom template
    console.log('Creating sandbox from custom template...');
    sandbox = await Sandbox.create(alias, {
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

// Run the custom template example
runCustomTemplateExample().catch((error) => {
  console.error('Failed to run custom template example:', error);
  process.exit(1);
});
