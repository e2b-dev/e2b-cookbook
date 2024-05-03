import 'server-only'

import { CodeInterpreter, Result, ProcessMessage } from '@e2b/code-interpreter'

const E2B_API_KEY = process.env.E2B_API_KEY
if (!E2B_API_KEY) {
  throw new Error('E2B_API_KEY environment variable not found')
}

/**
 * If you don't reconnect to the sandbox in this time (calculated after closing the sandbox), the sandbox will be closed.
 */
const sandboxTimeout = 10 * 60 * 1000 * 1000 // 10 minutes in ms

/**
 * The template to use for the sandbox.
 * If you are using CodeInterpreter it should be a custom template based on the code interpreter template.
 * https://e2b.dev/docs/code-interpreter/template
 */
const template = 'code-interpreter-stateful'

/**
 * Evaluate the code in the given session.
 *
 * @param sessionID The session ID to evaluate the code in.
 * @param code The code to evaluate.
 * @param onStdout The callback to call when the stdout is received.
 * @param onStderr The callback to call when the stderr is received.
 * @param onResult The callback to call when the result is received.
 * 
 * @returns The result of the evaluation. It includes all the data from the execution that you can also handle via the onStdout, onStderr, and onResult callbacks.
 */
export async function evaluateCode(
  sessionID: string,
  code: string,
  onStdout?: (stdout: ProcessMessage) => any,
  onStderr?: (stderr: ProcessMessage) => any,
  onResult?: (result: Result) => any,
) {
  const sandbox = await getSandbox(sessionID)

  try {
    const execution = await sandbox.notebook.execCell(code, {
      onStdout,
      onStderr,
      onResult,
    })

    return {
      results: execution.results,
      stdout: execution.logs.stdout,
      stderr: execution.logs.stderr,
      error: execution.error,
    }
  } finally {
    try {
      await sandbox.keepAlive(sandboxTimeout)
    } catch {
      // ignore errors from the keepalive and close the sandbox
    }

    // We disconnect from the sandbox because we are calling this function in a serverless environment.
    await sandbox.close()
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
  const sandboxes = await CodeInterpreter.list()

  const sandboxID = sandboxes.find(sandbox => sandbox.metadata?.sessionID === sessionID)?.sandboxID

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
    })
}

/**
 * Refresh the sandbox for the given session ID.
 * This is useful if you want to ensure that the sandbox is not killed based on user activity.
 *
 * @param sessionID The session ID of the sandbox to refresh.
 */
export async function refreshSandbox(sessionID: string) {
  const sandbox = await getSandbox(sessionID)

  try {
    await sandbox.keepAlive(sandboxTimeout)
  } catch {
    // ignore errors from the keepalive and close the sandbox
  }

  await sandbox.close()
}

export function nonEmpty<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}
