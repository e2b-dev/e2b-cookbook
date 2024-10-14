import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import Sandbox from 'e2b';

import { uploadPathToPath, readEnvFile } from "./utils"

// Read the E2B API key
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// List of all scripts and their respective interpreters
const scripts = [
  // Works:
  { name: 'hello-world-js', interpreter: 'npm', file: './examples/hello-world-js/' },
  { name: 'claude-code-interpreter-js', interpreter: 'npm', file: './examples/claude-code-interpreter-js/' },
  { name: 'scrape-and-analyze-airbnb-data-with-firecrawl', interpreter: 'npm', file: './examples/scrape-and-analyze-airbnb-data-with-firecrawl/' },
  { name: 'together-ai-with-code-interpreting-js', interpreter: 'npm', file: './examples/together-ai-with-code-interpreting/together-ai-code-interpreter-js' },
  { name: 'fireworks-code-interpreter-python', interpreter: 'jupyter', file: './examples/fireworks-code-interpreter-python/fireworks_code_interpreter.ipynb' },
  { name: 'llama-3-code-interpreter-python', interpreter: 'jupyter', file: './examples/llama-3-code-interpreter-python/llama_3_code_interpreter.ipynb' },
  { name: 'o1-code-interpreter-python', interpreter: 'jupyter', file: './examples/o1-code-interpreter-python/o1.ipynb' },
  { name: 'codestral-code-interpreter-js', interpreter: 'npm', file: './examples/codestral-code-interpreter-js/' },
  { name: 'gpt-4o-code-interpreter-js', interpreter: 'npm', file: './examples/gpt-4o-code-interpreter-js/' },
  { name: 'codestral-code-interpreter-python', interpreter: 'jupyter', file: './examples/codestral-code-interpreter-python/codestral_code_interpreter.ipynb' },
  { name: 'upload-dataset-code-interpreter', interpreter: 'jupyter', file: './examples/upload-dataset-code-interpreter/llama_3_code_interpreter_upload_dataset.ipynb' },
  { name: 'hello-world-python', interpreter: 'poetry', file: './examples/hello-world-python/' },

  // Inconsistent:
  { name: 'llama-3-code-interpreter-js', interpreter: 'npm', file: './examples/llama-3-code-interpreter-js/' },
  { name: 'o1-code-interpreter-js', interpreter: 'npm', file: './examples/o1-code-interpreter-js/' },

  // Doesn't work:
  { name: 'gpt-4o-code-interpreter', interpreter: 'jupyter', file: './examples/gpt-4o-code-interpreter/gpt_4o.ipynb' },
  { name: 'claude-code-interpreter-python', interpreter: 'jupyter', file: './examples/claude-code-interpreter-python/claude_code_interpreter.ipynb' },
  { name: 'claude-visualize-website-topics', interpreter: 'jupyter', file: './examples/claude-visualize-website-topics/claude-visualize-website-topics.ipynb' },
  { name: 'together-ai-with-code-interpreting', interpreter: 'jupyter', file: './examples/together-ai-with-code-interpreting/together-ai-code-interpreter-python/together_with_e2b_code_interpreter.ipynb' },
  { name: 'e2b_autogen', interpreter: 'poetry', file: './examples/e2b_autogen/' },
  { name: 'langchain-python', interpreter: 'poetry', file: './examples/langchain-python/' },
  { name: 'langgraph-python', interpreter: 'poetry', file: './examples/langgraph-python/' },

  // Untested:
  //{ name: 'nextjs-code-interpreter', interpreter: 'npm', file: './examples/nextjs-code-interpreter/' }
];

// Constants for the test process
const SANDBOX_TEST_DIRECTORY = '/home/user/example';
const LOGS_DIRECTORY = 'logs';
const SANDBOX_TIMEOUT = 300_000;
const COMMAND_TIMEOUT = 150_000;

// Return the command needed for a given test
function testScript(interpreter, notebookPath) {
  const INSTALL_POETRY_COMMAND = 'curl -sSL https://install.python-poetry.org | python3 -';
  const SET_PATH_COMMAND = 'PATH=/home/user/.local/bin/:$PATH'

  // Commands to test a Jupyter notebook in a Poetry environment.
  if (interpreter === "jupyter") {
    return [
      INSTALL_POETRY_COMMAND,
      SET_PATH_COMMAND,
      'poetry init --name my_project --python "^3.10" -n',
      'poetry add jupyter nbconvert pip python-dotenv',
      `poetry run jupyter nbconvert --debug --to markdown --execute --stdout ${notebookPath}`
    ];
  }
  
  // Commands to test a Poetry project.
  if (interpreter === "poetry") {
    return [
      INSTALL_POETRY_COMMAND,
      SET_PATH_COMMAND,
      `cd ${SANDBOX_TEST_DIRECTORY}`,
      "poetry install",
      "poetry run start"
    ];
  }

  // Commands to test a NodeJS project.
  if (interpreter === "npm") {
    return [
      `cd ${SANDBOX_TEST_DIRECTORY}`,
      "npm install",
      "npm run start"
    ];
  }

  return [];
}

describe('Integration test for multiple scripts in e2b sandbox', () => {

  // Set timeout for tests
  jest.setTimeout(120000);

  // Set the logs path
  const testTimestamp = new Date().toISOString().replace(/[:.]/g, '-'); // Format timestamp for folder name
  const logsDir = path.join(process.cwd(), LOGS_DIRECTORY, testTimestamp); // Path to store logs

  // Ensure the logs directory exists
  beforeAll(async () => {
    await fs.mkdir(logsDir, { recursive: true });
  });

  scripts.forEach(({ name, interpreter, file : examplePath }) => {
    it.concurrent(`should upload and execute ${name} successfully in e2b sandbox`, async () => {

      // Create a new E2B sandbox
      const sandbox = await Sandbox.create({ timeoutMs: SANDBOX_TIMEOUT });

      // Upload the example directory to the sandbox.
      await uploadPathToPath(examplePath, SANDBOX_TEST_DIRECTORY, sandbox);

      // Set the log path
      const logFilePath = path.join(logsDir, `${name}.txt`);
      let stdoutData = "";
      let stderrData = "";

      // Generate the script to test the example
      const notebookPath = path.posix.join(SANDBOX_TEST_DIRECTORY, path.basename(examplePath));
      const command = testScript(interpreter, notebookPath).join(" && ");

      // Run the command in the sandbox
      const result = await sandbox.commands.run(command, {
        // Log STDERR
        onStderr: async (output) => {
          stderrData += output;
          await fs.appendFile(logFilePath, output);
        },
        // Log STDOUT
        onStdout: async (output) => {
          stdoutData += output;
          await fs.appendFile(logFilePath, output);
        },
        envs: readEnvFile(),
        timeoutMs: COMMAND_TIMEOUT,
      });

      // Kill the sandbox
      sandbox.kill();

      // Check the exit code to see if the test passed
      if (result.exitCode !== 0) {
        await fs.appendFile(logFilePath, `Test for ${name} failed with exit code ${result.exitCode}\n`);
        await fs.appendFile(logFilePath, `stderr for ${name}: ${stderrData}\n`);
        console.error(`Test for ${name} failed.`);
        throw new Error(`Test for ${name} failed.`);
      }

      // Optionally, check for specific outputs (adapt this as needed)
      // expect(stdoutData).toContain('Expected output');

      // The test succeded
      console.log(`Test for ${name} completed successfully.`);
      await fs.appendFile(logFilePath, `Test for ${name} completed successfully.\n`);
    });
  });
});
