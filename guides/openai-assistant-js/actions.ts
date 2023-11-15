import { Sandbox } from '@e2b/sdk'
import path from 'path'

export async function saveCodeToFile(
  sandbox: Sandbox,
  { code, absolutePath }: { code: string; absolutePath: string },
): Promise<string> {
  try {
    const dir = path.dirname(absolutePath)

    await sandbox.filesystem.makeDir(dir)
    await sandbox.filesystem.write(absolutePath, code)

    return 'success'
  } catch (e) {
    return `Error: ${e.message}}`
  }
}

export async function listFiles(sandbox: Sandbox, { path }: { path: string }): Promise<string> {
  try {
    const files = await sandbox.filesystem.list(path)
    const response = files.map(file => (file.isDir ? `dir: ${file.name}` : file.name)).join('\n')
    return response
  } catch (e) {
    return `Error: ${e.message}}`
  }
}

export async function readFile(sandbox: Sandbox, { path }: { path: string }): Promise<string> {
  try {
    return await sandbox.filesystem.read(path)
  } catch (e) {
    return `Error: ${e.message}}`
  }
}
