import 'dotenv/config';
import Sandbox from 'e2b';
import { Agent, run, MCPServerStreamableHttp } from '@openai/agents';

async function runResearchAgent() {
  console.log('Creating E2B sandbox with arXiv and DuckDuckGo MCP servers...');
  
  let sandbox: Sandbox | null = null;
  let mcpServer: MCPServerStreamableHttp | null = null;
  
  try {
    // Create E2B sandbox with MCP servers
    sandbox = await Sandbox.create({
      mcp: {
        duckduckgo: {},
        arxiv: {
          storagePath: '/'
        },
      },
    });

    const mcpUrl = sandbox.getMcpUrl();
    console.log(`Sandbox created with MCP URL: ${mcpUrl}`);

    // Set up MCP server connection
    mcpServer = new MCPServerStreamableHttp({
      url: mcpUrl,
      name: 'E2B MCP Gateway',
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
      name: 'Research Assistant',
      model: 'gpt-4o', // Using gpt-4o instead of gpt-5-nano-2025-08-07 for compatibility
      mcpServers: [mcpServer],
    });

    console.log('Connecting to MCP server...');
    await mcpServer.connect();
    console.log('Connected to MCP server successfully');

    console.log('Starting research agent...');
    const researchPrompt = 'Find an interesting recent paper about large language models on arXiv, then search for the main author on DuckDuckGo to learn more about them.';

    const result = await run(
      agent,
      researchPrompt,
      {
        stream: true,
      }
    );

    console.log('\nResearch Results:');
    result
      .toTextStream({ compatibleWithNodeStreams: true })
      .pipe(process.stdout);

    await result.completed;
    console.log('\nResearch completed successfully!');

  } catch (error) {
    console.error('Error occurred:', error);
    throw error;
  } finally {
    // Cleanup
    if (mcpServer) {
      console.log('\nClosing MCP server connection...');
      await mcpServer.close();
      console.log('MCP server closed successfully');
    }
    
    if (sandbox) {
      console.log('Cleaning up sandbox...');
      await sandbox.kill();
      console.log('Sandbox closed successfully');
    }
  }
}

// Run the research agent
runResearchAgent().catch((error) => {
  console.error('Failed to run research agent:', error);
  process.exit(1);
});
