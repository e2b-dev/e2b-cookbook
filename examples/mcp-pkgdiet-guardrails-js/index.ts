import { CodeInterpreter } from '@e2b/code-interpreter';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('Starting PkgDiet MCP Guardrails Demo...\n');

  // 1. Connect to the PkgDiet MCP Server via stdio
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'pkgdiet@2.0.1', 'mcp'],
  });

  const mcpClient = new Client(
    { name: 'e2b-pkgdiet-guard', version: '1.0.0' },
    { capabilities: {} }
  );

  console.log('Connecting to local PkgDiet MCP Server...');
  await mcpClient.connect(transport);
  console.log('Connected to MCP server successfully.\n');

  // Packages an AI Agent might try to install
  const packagesToEvaluate = [
    'express', // A safe, common package
    'request', // Deprecated, will trigger a WARN
    'colors.js' // Hypothetical or malicious typosquat, triggering a BLOCK depending on policy
  ];

  for (const pkg of packagesToEvaluate) {
    console.log(`==========================================`);
    console.log(`🕵️  Evaluating agent dependency request: "${pkg}"`);
    console.log(`==========================================`);
    
    // 2. Ask PkgDiet if the package is safe to install
    const result = await mcpClient.callTool({
      name: 'check_dependency',
      arguments: { package_name: pkg },
    });

    const mcpResponse = result.content[0].text as string;
    console.log(`\n[PkgDiet Verdict]\n${mcpResponse}\n`);

    // 3. Decide whether to allow sandbox execution based on the verdict
    if (mcpResponse.includes('[BLOCK]')) {
      console.log(`❌ Guardrail triggered! Blocked installation of "${pkg}" into the E2B Sandbox.`);
      console.log(`-> The agent will be informed to find a different package.\n`);
    } else {
      console.log(`✅ Package "${pkg}" passed guardrails. Firing up E2B Sandbox...`);
      
      const sandbox = await CodeInterpreter.create();
      try {
        console.log(`-> Running: npm install ${pkg}`);
        const execResult = await sandbox.notebook.execCell(`!npm install ${pkg}`);
        
        if (execResult.error) {
          console.error('Error during installation:', execResult.error);
        } else {
          console.log(`-> Successfully installed ${pkg} in isolated sandbox.`);
        }
      } finally {
        await sandbox.close();
        console.log(`-> Sandbox terminated.\n`);
      }
    }
  }

  // Cleanup
  await transport.close();
}

main().catch(console.error);
