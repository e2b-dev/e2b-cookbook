// A thin wrapper around the `openshell` CLI that openshell-e2b installs.
// `npm run connect` in that checkout keeps the gateway tunnel open and writes the
// CLI's gateway config and client certificates under .openshell-separated.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const dir = resolve(process.env.OPENSHELL_E2B_DIR ?? '../../../openshell-e2b')
const bin = join(dir, '.bin/openshell')
const env = { ...process.env, XDG_CONFIG_HOME: join(dir, '.openshell-separated'), OPENSHELL_COLOR: 'never' }

export function checkSetup() {
  if (!existsSync(bin)) {
    throw new Error(`No OpenShell CLI at ${bin}. Set OPENSHELL_E2B_DIR to your openshell-e2b checkout (see README).`)
  }
}

export function openshell(args: string[], extraEnv: Record<string, string> = {}): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
    const outChunks: Buffer[] = []
    const errChunks: Buffer[] = []
    child.stdout.on('data', (d: Buffer) => { outChunks.push(d) })
    child.stderr.on('data', (d: Buffer) => { errChunks.push(d) })
    child.on('error', reject)
    child.on('close', (code) => {
      const out = Buffer.concat(outChunks).toString('utf8')
      const err = Buffer.concat(errChunks).toString('utf8')
      if (code === 0) {
        resolvePromise(out)
      } else {
        reject(new Error(`openshell ${args[0]} ${args[1] ?? ''} failed: ${(err || out).trim()}`))
      }
    })
  })
}

// Runs a shell command in the sandbox as its workload user.
export const exec = (sandbox: string, command: string) =>
  openshell(['sandbox', 'exec', '-n', sandbox, '--no-tty', '--', 'sh', '-c', command])

// Creates a sandbox with one provider and waits until the gateway reports it Ready.
export async function createSandbox(name: string, provider: string) {
  await openshell(['sandbox', 'create', '--name', name, '--provider', provider, '--detach', '--no-tty', '--', 'sleep', 'infinity'])
  for (let i = 0; i < 180; i++) {
    const list = await openshell(['sandbox', 'list'])
    if (list.split('\n').some((l) => l.startsWith(`${name} `) && /\bReady\b/.test(l))) {
      return
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Sandbox ${name} did not become Ready in 3 minutes`)
}

// Copies a local folder into the sandbox as /sandbox/<folder name>.
export const upload = (sandbox: string, folder: string) => openshell(['sandbox', 'upload', sandbox, folder, '/sandbox'])
