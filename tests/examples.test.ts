import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import Sandbox from 'e2b';

import { uploadPathToPath, getApiKeys } from "./utils"

// Read the E2B API key
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// List of all scripts and their respective interpreters
const scripts = [
  { name: 'hello-world-js', interpreter: 'npm', file: './examples/hello-world-js/' },
  { name: 'claude-code-interpreter-js', interpreter: 'npm', file: './examples/claude-code-interpreter-js/' },
  { name: 'firecrawl-scrape-and-analyze-airbnb-data', interpreter: 'npm', file: './examples/firecrawl-scrape-and-analyze-airbnb-data/' },
  { name: 'together-ai-code-interpreter-js', interpreter: 'npm', file: './examples/together-ai-code-interpreter-js' },
  { name: 'fireworks-code-interpreter-python', interpreter: 'jupyter', file: './examples/fireworks-code-interpreter-python/qwen_code_interpreter.ipynb' },
  { name: 'groq-code-interpreter-python', interpreter: 'jupyter', file: './examples/groq-code-interpreter-python/llama_3_code_interpreter.ipynb' },
  { name: 'o1-code-interpreter-python', interpreter: 'jupyter', file: './examples/o1-and-gpt-4-python/o1.ipynb' },
  { name: 'codestral-code-interpreter-js', interpreter: 'npm', file: './examples/codestral-code-interpreter-js/' },
  { name: 'gpt-4o-code-interpreter-js', interpreter: 'npm', file: './examples/gpt-4o-js/' },
  { name: 'codestral-code-interpreter-python', interpreter: 'jupyter', file: './examples/codestral-code-interpreter-python/codestral_code_interpreter.ipynb' },
  { name: 'upload-dataset-code-interpreter', interpreter: 'jupyter', file: './examples/upload-dataset-code-interpreter/llama_3_code_interpreter_upload_dataset.ipynb' },
  { name: 'hello-world-python', interpreter: 'poetry', file: './examples/hello-world-python/' },
  { name: 'o1-code-interpreter-js', interpreter: 'npm', file: './examples/o1-and-gpt-4-js/' },
  { name: 'gpt-4o-code-interpreter', interpreter: 'jupyter', file: './examples/gpt-4o-python/gpt_4o.ipynb' },
  { name: 'together-ai-code-interpreter-python', interpreter: 'jupyter', file: './examples/together-ai-code-interpreter-python/together_with_e2b_code_interpreter.ipynb' },
  { name: 'langchain-python', interpreter: 'poetry', file: './examples/langchain-python/' },
  { name: 'langgraph-python', interpreter: 'poetry', file: './examples/langgraph-python/' },
  { name: 'groq-code-interpreter-js', interpreter: 'npm', file: './examples/groq-code-interpreter-js/' },
  { name: 'claude-code-interpreter-python', interpreter: 'jupyter', file: './examples/claude-code-interpreter-python/claude_code_interpreter.ipynb' },
  { name: 'claude-visualize-website-topics', interpreter: 'jupyter', file: './examples/claude-visualize-website-topics/claude-visualize-website-topics.ipynb' },
  { name: 'watsonx-ai-code-interpreter-python', interpreter: 'jupyter', file: './examples/watsonx-ai-code-interpreter-python/granite_code_interpreter.ipynb' },
  { name: 'mcp-client-js', interpreter: 'npm', file: './examples/mcp-client-js/' },
  { name: 'mcp-custom-server-js', interpreter: 'npm', file: './examples/mcp-custom-server-js/' },
  { name: 'mcp-custom-template-js', interpreter: 'npm', file: './examples/mcp-custom-template-js/' },
  { name: 'mcp-research-agent-js', interpreter: 'npm', file: './examples/mcp-research-agent-js/' },
  { name: 'mcp-claude-code-js', interpreter: 'npm', file: './examples/mcp-claude-code-js/' },
  { name: 'mcp-browserbase-js', interpreter: 'npm', file: './examples/mcp-browserbase-js/' },
  { name: 'mcp-groq-exa-js', interpreter: 'npm', file: './examples/mcp-groq-exa-js/' },
  { name: 'sandbox-agent-sdk-js', interpreter: 'npm', file: './examples/sandbox-agent-sdk-js/' },
  { name: 'openai-js', interpreter: 'npm', file: './examples/openai-js/' },
  { name: 'openai-python', interpreter: 'jupyter', file: './examples/openai-python/openai.ipynb' },
  { name: 'watsonx-ai-code-interpreter-js', interpreter: 'npm', file: './examples/watsonx-ai-code-interpreter-js/' },
  { name: 'agentkit-coding-agent', interpreter: 'npm', file: './examples/agentkit-coding-agent/' },
  { name: 'custom-sandbox-domain-proxy', interpreter: 'npm', file: './examples/custom-sandbox-domain-proxy/' },
  { name: 'crewai-python', interpreter: 'uv', file: './examples/crewai-python/' },
  { name: 'stirrup-python', interpreter: 'uv', file: './examples/stirrup-python/' },
];

// Deliberately not covered, and why. Anything not listed here should be added above.
//
// Needs a custom E2B template built first, which this runner does not do:
//   anthropic-claude-code-in-sandbox-js, anthropic-claude-code-in-sandbox-python,
//   openai-codex-in-sandbox-js, openai-codex-in-sandbox-python, playwright-in-e2b
// Multiple projects in one directory, which the one-project-per-dir runner cannot express:
//   anthropic-managed-agents (javascript/ + python/), docker-in-e2b (js/ + python/)
// No single entrypoint:
//   openai-agents-sdk (11 standalone scripts, no manifest)
// Needs its own toolchain (the `eve` CLI, Node >=24):
//   flue-feedback-analyst-js, vercel-eve-feedback-analyst-js
// No integration test for a Next.js app yet:
//   nextjs-code-interpreter

// Constants for the test process
const SANDBOX_TEST_DIRECTORY = '/home/user/example';
const LOGS_DIRECTORY = 'logs';
const SANDBOX_TIMEOUT = 300_000;
const COMMAND_TIMEOUT = 150_000;

// Return the command needed for a given test
function testScript(interpreter, notebookPath) {
  const INSTALL_POETRY_COMMAND = 'curl -sSL https://install.python-poetry.org | python3 -';
  // Installed from PyPI rather than `curl | sh`: this sandbox is handed provider API
  // keys a moment later, so we do not want an unpinned remote script in that path.
  const INSTALL_UV_COMMAND = 'pip install --quiet uv';
  const SET_PATH_COMMAND = 'PATH=/home/user/.local/bin/:$PATH'

  // Commands to test a uv / PEP-621 project. Entrypoint is main.py by convention.
  if (interpreter === "uv") {
    return [
      INSTALL_UV_COMMAND,
      SET_PATH_COMMAND,
      `cd ${SANDBOX_TEST_DIRECTORY}`,
      "uv sync",
      "uv run main.py"
    ];
  }

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
    it.concurrent(name, async () => {

      let attempts = 0;
      const maxAttempts = 3;
      let success = false;

      while (attempts < maxAttempts && !success) {
        attempts++;

        // Create a new E2B sandbox
        const sandbox = await Sandbox.create({ timeoutMs: SANDBOX_TIMEOUT });

        // Set the log path. Declared outside the try so the catch below can write to it:
        // commands.run throws CommandExitError on a non-zero exit, so a failing example
        // lands in the catch and its output would otherwise be lost.
        const logFilePath = path.join(logsDir, `${name}.txt`);

        try {

          // Upload the example directory to the sandbox.
          await uploadPathToPath(examplePath, SANDBOX_TEST_DIRECTORY, sandbox);

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
            envs: getApiKeys(),
            timeoutMs: COMMAND_TIMEOUT,
          });

          // Check the exit code to see if the test passed
          if (result.exitCode !== 0) {
            await fs.appendFile(logFilePath, `Attempt ${attempts}: Test for ${name} failed with exit code ${result.exitCode}\n`);
            await fs.appendFile(logFilePath, `stderr for ${name}: ${stderrData}\n`);
            if (stderrData.includes("exceeded your rate limit")) {
              console.log("Attempt ${attempts}: Test for ${name} exceeded rate limit, waiting 10 seconds...");
              await new Promise((resolve) => setTimeout(resolve, 10000));
            } else {
              console.log(`Attempt ${attempts}: Test for ${name} failed.`);
            }
          } else {
            // The test succeeded
            success = true;
            console.log(`Test for ${name} completed successfully on attempt ${attempts}.`);
            await fs.appendFile(logFilePath, `Test for ${name} completed successfully on attempt ${attempts}.\n`);
          }
        } catch (error) {
          console.log(`Attempt ${attempts}/${maxAttempts}: An error occurred while running the test for ${name}`, error);
          await fs.appendFile(
            logFilePath,
            `\nAttempt ${attempts}/${maxAttempts}: ${name} threw\n${error?.stack ?? error}\n` +
            `stderr: ${(error as any)?.result?.stderr ?? (error as any)?.stderr ?? '(none)'}\n`
          );
        } finally {
          // Kill the sandbox
          await sandbox.kill();
        }

        if (!success && attempts === maxAttempts) {
          throw new Error(`Test for ${name} failed after ${maxAttempts} attempts.`);
        }
      }
    });
  });
});
