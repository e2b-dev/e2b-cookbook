import 'dotenv/config';
import Sandbox from 'e2b';
import { OpenAI } from 'openai';

async function runGroqExaExample() {
  console.log('Creating E2B sandbox with Exa MCP server...');
  
  // Create E2B sandbox with Exa MCP server
  const sandbox = await Sandbox.create({
    mcp: {
      exa: {
        apiKey: process.env.EXA_API_KEY!,
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

  console.log('Starting AI research with Groq and Exa...');
  
  const researchPrompt = 'What happened last week in AI? Use Exa to search for recent AI developments and provide a comprehensive summary.';

  const response = await client.responses.create({
    model: 'moonshotai/kimi-k2-instruct-0905',
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

// Run the Groq Exa example
runGroqExaExample().catch((error) => {
  console.error('Failed to run Groq Exa example:', error);
  process.exit(1);
});
