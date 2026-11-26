// A thin wrapper around the `openshell` CLI that openshell-e2b installs.
// `npm run connect` in that checkout keeps the gateway tunnel open and writes the
// CLI's gateway config and client certificates under .openshell-separated.
import { spawn } from 'node:child_process'
import { existsSync, openSync } from 'node:fs'
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
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', reject)
    child.on('close', (code) => {
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

// `sandbox create` stays attached to the sandbox's command, so it runs detached
// (output in `logFile`) and readiness comes from `sandbox list`.
export async function createSandbox(name: string, provider: string, logFile: string) {
  const log = openSync(logFile, 'w')
  spawn(bin, ['sandbox', 'create', '--name', name, '--provider', provider, '--no-tty', '--', 'sleep', 'infinity'],
    { env, detached: true, stdio: ['ignore', log, log] }).unref()
  for (let i = 0; i < 180; i++) {
    const list = await openshell(['sandbox', 'list'])
    if (list.split('\n').some((l) => l.startsWith(`${name} `) && /\bReady\b/.test(l))) {
      return
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Sandbox ${name} did not become Ready in 3 minutes; see ${logFile}`)
}

// Forwards a loopback port inside the sandbox to the same port on this machine,
// over the gateway channel. Returns the child; kill it to stop forwarding.
export const forward = (sandbox: string, port: number) =>
  spawn(bin, ['forward', 'service', '--target-port', String(port), '--local', `127.0.0.1:${port}`, sandbox], { env, stdio: 'ignore' })
