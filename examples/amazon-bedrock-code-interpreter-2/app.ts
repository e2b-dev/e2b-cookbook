import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import dotenv from 'dotenv';
import { CodeInterpreter, Result } from '@e2b/code-interpreter';
import fs from 'node:fs';

dotenv.config();

const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
const awsSessionToken = process.env.AWS_SESSION_TOKEN;
const awsRegion = 'eu-west-3';

console.log("AWS Access Key:", awsAccessKey);
console.log("AWS Secret Key:", awsSecretKey ? '***' : 'Not provided');
console.log("AWS Session Token:", awsSessionToken ? '***' : 'Not provided');
console.log("AWS Region:", awsRegion);

if (!awsAccessKey || !awsSecretKey || !awsSessionToken) {
  throw new Error('Missing AWS credentials or session token.');
}

const client = new AnthropicBedrock({
  awsAccessKey,
  awsSecretKey,
  awsSessionToken,
  awsRegion,
});

const tools: Array<CompletionCreateParams.Tool> = [
  {
    type: 'function',
    function: {
      name: 'execute_python',
      description: 'Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The python code to execute in a single cell.',
          },
        },
        required: ['code'],
      },
    },
  },
];

async function codeInterpret(e2b_code_interpreter: CodeInterpreter, code: string) {
  console.log('Running code interpreter...');
  const exec = await e2b_code_interpreter.notebook.execCell(code, {
    onStderr: (stderr) => console.log('[Code Interpreter]', stderr),
    onStdout: (stdout) => console.log('[Code Interpreter]', stdout),
  });

  if (exec.error) {
    console.log('[Code Interpreter ERROR]', exec.error);
  } else {
    return exec.results;
  }
}

const TASK = 'Visualize a distribution of height of men based on the latest data you know';

async function main() {
  try {
    console.log(`\n${'='.repeat(50)}\nUser message: Hello, world\n${'='.repeat(50)}`);

    const message = await client.messages.create({
      model: 'anthropic.claude-3-sonnet-20240229-v1:0',
      max_tokens: 256,
      messages: [{ "role": "user", "content": "Hello, world" }],
    });
    console.log(message);

    const code_results = await codeInterpret(new CodeInterpreter(), TASK);

    if (!code_results) {
      console.log('No code results');
      process.exit(1);
    }

    const first_result = code_results[0];
    console.log('Result has following formats:', first_result.formats());

    fs.writeFileSync(
      'image.png',
      Buffer.from(first_result.png, 'base64'),
    );

    console.log('Execution completed successfully');
    process.exit(0);

  } catch (error) {
    console.error("Error making request:", error);
  }
}

main().catch(console.error);
