'use server'

import { CodeInterpreter } from '@e2b/code-interpreter'

export const sandboxTimeout = 10 * 60 * 1000 // 10 minutes in ms

// Creates a new or connects to an existing code interpreter sandbox
export async function createOrConnect(userID: string) {
  console.log('create or connect', userID)
  const allSandboxes = await CodeInterpreter.list()
  console.log('all sandboxes', allSandboxes)
  const sandboxInfo = allSandboxes.find(sbx => sbx.metadata?.userId === userID)
  console.log('sandbox info', sandboxInfo)
  if (!sandboxInfo) {
    return await CodeInterpreter.create({
      metadata: {
        userId: userID
      }
    })
  }
  return CodeInterpreter.reconnect(sandboxInfo.sandboxID)
}

// Runs AI-generated Python code in the code interpreter sandbox
export async function runPython(userID: string, code: string) {
  const sbx = await createOrConnect(userID)
  console.log('Running code', code)
  const result = await sbx.notebook.execCell(code)
  console.log('Command result', result)
  return result
}
