import 'dotenv/config';
import Sandbox from 'e2b';

async function runClaudeCodeExample() {
  console.log('Creating E2B sandbox with Claude Code CLI and MCP servers...');
  
  // Create E2B sandbox with MCP servers
  const sandbox = await Sandbox.create({
    envs: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    },
    mcp: {
      duckduckgo: {},
      arxiv: {
        storagePath: '/'
      },
    },
  });

  const mcpUrl = sandbox.getMcpUrl();
  const mcpToken = await sandbox.getMcpToken();
  console.log(`Sandbox created with MCP URL: ${mcpUrl}`);

  // Add MCP server with authentication token
  console.log('Adding MCP server to Claude Code...');
  await sandbox.commands.run(
    `claude mcp add --transport http e2b-mcp-gateway ${mcpUrl} --header "Authorization: Bearer ${mcpToken}"`, 
    { 
      timeoutMs: 0, 
      onStdout: console.log, 
      onStderr: console.log 
    }
  );

  console.log('Starting Claude Code research...');
  console.log('This will take a bit as Claude researches papers and authors...');
  
  // Run Claude Code with research task
  await sandbox.commands.run(
    `echo 'Use arxiv to search for a new paper about large language models and summarize it. Then use duckduckgo to find information about the main authors. Finally, create a minimal index.html page (in /web directory) outlining the paper and authors.' | claude -p --dangerously-skip-permissions`,
    { 
      timeoutMs: 0, 
      onStdout: console.log, 
      onStderr: console.log 
    }
  );

  console.log('Starting web server to host the research results...');
  await sandbox.commands.run(
    'python3 -m http.server 3000 -d web', 
    { 
      background: true, 
      timeoutMs: 0, 
      onStdout: console.log, 
      onStderr: console.log 
    }
  );

  const webserverUrl = sandbox.getHost(3000);
  console.log(`\nResearch completed successfully!`);
  console.log(`Visit the research results at: http://${webserverUrl}/index.html`);
  console.log(`The page contains the paper summary and author information`);

}

// Run the Claude Code example
runClaudeCodeExample().catch((error) => {
  console.error('Failed to run Claude Code example:', error);
  process.exit(1);
});
