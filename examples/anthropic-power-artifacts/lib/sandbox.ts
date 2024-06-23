'use server'

// import { Sandbox } from 'e2b'
import { CodeInterpreter } from '@e2b/code-interpreter'

export const sandboxTimeout = 10 * 60 * 1000 // 10 minutes in ms

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

export async function writeFile(userID: string, path: string, content: string) {
  const sbx = await createOrConnect(userID)
  await sbx.filesystem.write(path, content)
}

export async function runCommand(userID: string, command: string) {
  const sbx = await createOrConnect(userID)
  console.log('Sandbox created', sbx)
  console.log('Running command', command)
  const result = await sbx.process.startAndWait(command)
  console.log('Command result', result)

  await sbx.keepAlive(sandboxTimeout)
  return result
}

export async function listFiles(userID: string, path: string) {
  const sbx = await createOrConnect(userID)
  console.log('Sandbox created', sbx)
  console.log('Listing files', path)
  const files = await sbx.filesystem.list(path)
  console.log('Files', files)
  return files
}

export async function runPython(userID: string, code: string) {
  const sbx = await createOrConnect(userID)
  console.log('Running code', code)
  const result = await sbx.notebook.execCell(code)
  console.log('Command result', result)
  return result
}
