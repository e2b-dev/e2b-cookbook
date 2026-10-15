import 'dotenv/config';
import Sandbox from 'e2b';
import { OpenAI } from 'openai';

async function runGroqLinkupExample() {
  console.log('Creating E2B sandbox with Linkup MCP server...');

  // Create E2B sandbox with the Linkup MCP server from GitHub
  const sandbox = await Sandbox.create({
    mcp: {
      'github/LinkupPlatform/linkup-mcp-server': {
        installCmd: 'npm install && npm run build',
        runCmd: 'node dist/stdio.js',
        envs: {
          LINKUP_API_KEY: process.env.LINKUP_API_KEY!,
        },
      },
    },
    timeoutMs: 600_000, // 10 minutes
  });

  console.log('Sandbox created successfully');
  console.log(`MCP URL: ${sandbox.getMcpUrl()}`);

  // Create Groq client
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  console.log('Starting AI research with Groq and Linkup...');

  const researchPrompt = 'What happened last week in AI? Use Linkup to search for recent AI developments and provide a comprehensive summary with sources.';

  const response = await client.responses.create({
    model: 'openai/gpt-oss-120b',
    input: researchPrompt,
    tools: [
      {
        type: 'mcp',
        server_label: 'e2b-mcp-gateway',
        server_url: sandbox.getMcpUrl(),
        headers: {
          'Authorization': `Bearer ${await sandbox.getMcpToken()}`
        }
      }
    ]
  });

  console.log('\nResearch Results:');
  console.log(response.output_text);

  // Cleanup
  console.log('\nCleaning up sandbox...');
  await sandbox.kill();
  console.log('Sandbox closed successfully');
}

// Run the Groq Linkup example
runGroqLinkupExample().catch((error) => {
  console.error('Failed to run Groq Linkup example:', error);
  process.exit(1);
});
