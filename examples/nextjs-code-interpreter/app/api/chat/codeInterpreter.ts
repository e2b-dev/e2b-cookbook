import 'server-only';

import { CodeInterpreter } from '@e2b/code-interpreter';

const E2B_API_KEY = process.env.E2B_API_KEY;
if (!E2B_API_KEY) {
  throw new Error('E2B_API_KEY environment variable not found');
}

/**
 * If you don't reconnect to the sandbox in this time (calculated after closing the sandbox), the sandbox will be killed.
 */
const sandboxTimeout = 10 * 60 * 1000; // 10 minutes in ms

/**
 * The template to use for the sandbox.
 * If you are using CodeInterpreter it should be a custom template based on the code interpreter template.
 * https://e2b.dev/docs/code-interpreter/template
 */
const template = 'code-interpreter-stateful';

/**
 * Evaluate the code in the given session.
 *
 * @param sessionID The session ID to evaluate the code in.
 * @param code The code to evaluate.
 * 
 * @returns The result of the evaluation. It includes all the data from the execution that you can also handle via the onStdout, onStderr, and onResult callbacks.
 */
export async function evaluateCode(
  sessionID: string,
  code: string,
) {
  const sandbox = await getSandbox(sessionID);

  try {
    // Execute the code in a Jupyter Notebook in the sandbox.
    // https://e2b.dev/docs/code-interpreter/execution
    const execution = await sandbox.notebook.execCell(code, {
      // We can also use callbacks to handle streaming stdout, stderr, and results from the sandbox.
      // This is useful if you want to stream the results to client directly.
      // onStdout,
      // onStderr,
      // onResult,
    });

    return {
      results: execution.results,
      stdout: execution.logs.stdout,
      stderr: execution.logs.stderr,
      error: execution.error,
    };
  } finally {
    try {
      // This will ensure the sandbox is not killed after closing the connection in the next 10 minutes.
      await sandbox.keepAlive(sandboxTimeout);
    } catch {
      // Ignore errors from the keepalive and close the sandbox.
    }

    // We disconnect from the sandbox because we are calling this function in a serverless environment and don't want to keep the connection active.
    await sandbox.close();
  }
}

/**
 * Get the sandbox for the given session ID saved in the sandbox metadata.
 * If the sandbox is not found, create a new one.
 *
 * @param sessionID The session ID to get the sandbox for.
 * @returns The sandbox for the given session ID.
 */
async function getSandbox(sessionID: string) {
  const sandboxes = await CodeInterpreter.list();

  // We check if the sandbox is already running for the given session ID.
  const sandboxID = sandboxes.find(sandbox => sandbox.metadata?.sessionID === sessionID)?.sandboxID;

  // If the sandbox is already running, we reconnect to it.
  // https://e2b.dev/docs/sandbox/api/reconnect
  return sandboxID
    ? await CodeInterpreter.reconnect({
      sandboxID,
      apiKey: E2B_API_KEY,
    })
    : await CodeInterpreter.create({
      template,
      apiKey: E2B_API_KEY,
      metadata: {
        sessionID,
      },
    });
}

export function nonEmpty<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
