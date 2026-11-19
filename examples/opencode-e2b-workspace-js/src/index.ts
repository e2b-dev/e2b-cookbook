/**
 * Warp an OpenCode session into an E2B sandbox — headless.
 *
 * This is the same flow you would drive in the OpenCode TUI with `/warp`, but over
 * OpenCode's HTTP API so it can run as a script:
 *
 *   1. start a local `opencode serve` with the E2B workspace plugin loaded
 *   2. create an `e2b` workspace  → the plugin provisions a sandbox and starts a
 *      remote OpenCode server on a copy of this project
 *   3. ask the agent inside the sandbox where it is running
 *   4. start a session locally, then warp it into the sandbox and ask again
 *   5. remove the workspace
 */
import 'dotenv/config'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

const PROJECT_DIR = path.resolve(process.env.PROJECT_DIR ?? 'demo-project') // the WIP project to open
const PLUGIN = process.env.OPENCODE_E2B_PLUGIN ?? 'opencode-e2b-workspace-plugin'
const PORT = 20_000 + Math.floor(Math.random() * 20_000)
const PROMPT = 'Run `hostname` and `pwd`, then tell me in one sentence where you are running.'

/** An error that should stop waiting immediately instead of being retried. */
class Fatal extends Error {}

if (!process.env.E2B_API_KEY) {
  console.error('Set E2B_API_KEY (see .env.example)')
  process.exit(1)
}

// --- start opencode with the plugin -------------------------------------------------

// The config lives in a temp dir, not in the project: the project is uploaded into
// the sandbox, and the sandbox's OpenCode must not try to load the plugin itself.
const configDir = await mkdtemp(path.join(tmpdir(), 'opencode-e2b-'))
await writeFile(
  path.join(configDir, 'opencode.json'),
  JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    plugin: [[PLUGIN, { sandboxTimeoutMs: 3_600_000 }]],
  }),
)

const server: ChildProcess = spawn('opencode', ['serve', '--port', String(PORT)], {
  cwd: PROJECT_DIR,
  env: {
    ...process.env,
    OPENCODE_CONFIG: path.join(configDir, 'opencode.json'),
    OPENCODE_EXPERIMENTAL_WORKSPACES: 'true',
  },
  stdio: 'ignore',
})
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT') console.error('`opencode` was not found on PATH. Install OpenCode 1.16+ first: https://opencode.ai/docs')
  else console.error(error)
  process.exit(1)
})
process.on('exit', () => {
  server.kill()
  rmSync(configDir, { recursive: true, force: true })
})

const base = `http://127.0.0.1:${PORT}`
await waitFor(() => api('GET', '/global/health'), 'opencode to start')
step(`OpenCode is up at ${base}`)

// --- pick a model -------------------------------------------------------------------

const model = await resolveModel()
step(`Using model ${model.providerID}/${model.modelID}`)

// --- create the E2B workspace -------------------------------------------------------

step('Creating an E2B workspace (first run builds a template, ~1–2 min; later runs ~15 s)…')
const workspace = await api('POST', '/experimental/workspace', { type: 'e2b', branch: null })

// From here on the sandbox exists and is billed, so everything runs inside try/finally.
try {
  await waitFor(async () => {
    const statuses = await api('GET', '/experimental/workspace/status')
    const mine = statuses.find((s: any) => s.workspaceID === workspace.id)
    if (mine?.status === 'error') throw new Fatal('workspace failed to connect')
    return mine?.status === 'connected' ? mine : undefined
  }, 'workspace to connect', 15 * 60_000)
  step(`Workspace ${workspace.name} is connected. Project path in the sandbox: ${workspace.directory}`)

  // --- a session that starts inside the sandbox ------------------------------------

  const remote = await api('POST', '/session', {}, { workspace: workspace.id })
  step('Asking the agent inside the sandbox where it runs…')
  say(await prompt(remote.id, { workspace: workspace.id }))

  // --- warp: start local, move the live session into the sandbox --------------------

  const local = await api('POST', '/session', {})
  step('Starting a local session and asking the same question…')
  say(await prompt(local.id))

  step(`Warping session ${local.id} into ${workspace.name}…`)
  await api('POST', '/experimental/workspace/warp', {
    id: workspace.id,
    sessionID: local.id,
    copyChanges: false,
  })
  step('Same session, now inside the sandbox:')
  // Moving a session that already has history replays its events into the sandbox.
  // OpenCode's sync can occasionally lag behind that replay ("Timed out waiting for
  // sync fence"); it usually settles within a few seconds, so give it a couple of tries.
  say(await retry(() => prompt(local.id, { workspace: workspace.id }), /sync fence/, 3))
} finally {
  // --- clean up ---------------------------------------------------------------------

  step('Removing the workspace and its sandbox…')
  // Never let cleanup hide the error that got us here.
  await api('DELETE', `/experimental/workspace/${workspace.id}`).catch((error) => console.error('workspace removal failed:', error))
  server.kill()
}

// --- helpers ------------------------------------------------------------------------

async function api(method: string, route: string, body?: unknown, query: Record<string, string> = {}) {
  const url = new URL(route, base)
  url.searchParams.set('directory', PROJECT_DIR)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${url.pathname} → ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : undefined
}

async function prompt(sessionID: string, query: Record<string, string> = {}) {
  const res = await api('POST', `/session/${sessionID}/message`, {
    model,
    parts: [{ type: 'text', text: PROMPT }],
  }, query)
  if (res.info?.error) throw new Error(res.info.error.data?.message ?? res.info.error.name)
  return res.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('').trim()
}

async function resolveModel() {
  if (process.env.OPENCODE_MODEL) {
    const [providerID, ...rest] = process.env.OPENCODE_MODEL.split('/')
    return { providerID, modelID: rest.join('/') }
  }
  // Only credentials stored by `opencode auth login` reach the sandbox; a provider that is
  // "connected" through a shell env var would work locally and fail inside the workspace.
  const stored = storedAuthProviders()
  const providers = await api('GET', '/provider')
  const provider = providers.all.find((p: any) => providers.connected.includes(p.id) && stored.has(p.id))
  if (!provider) {
    throw new Error('No provider is logged in with `opencode auth login`. Log in, or set OPENCODE_MODEL to a provider you are logged into.')
  }
  const modelID = providers.default?.[provider.id] ?? Object.keys(provider.models)[0]
  return { providerID: provider.id, modelID }
}

/** Provider ids with credentials in OpenCode's auth store (what `opencode auth login` writes). */
function storedAuthProviders(): Set<string> {
  const file = path.join(process.env.XDG_DATA_HOME || path.join(homedir(), '.local', 'share'), 'opencode', 'auth.json')
  if (!existsSync(file)) return new Set()
  try {
    return new Set(Object.keys(JSON.parse(readFileSync(file, 'utf8'))))
  } catch {
    return new Set()
  }
}

async function waitFor<T>(check: () => Promise<T | undefined>, what: string, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      // Connection refused / not-ready responses are expected while things start up.
      if (error instanceof Fatal) throw error
    }
    await new Promise((r) => setTimeout(r, 2_000))
  }
  throw new Error(`Timed out waiting for ${what}`)
}

async function retry<T>(fn: () => Promise<T>, retryOn: RegExp, attempts: number): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i >= attempts || !retryOn.test(String(error))) throw error
      console.log(`  ⏳ sync not settled yet (attempt ${i}/${attempts}), retrying…`)
      await new Promise((r) => setTimeout(r, 5_000))
    }
  }
}

function step(message: string) {
  console.log(`\n▶ ${message}`)
}
function say(reply: string) {
  console.log(`  🤖 ${reply}`)
}
