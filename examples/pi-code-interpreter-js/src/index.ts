// Pi in an E2B sandbox builds its own E2B code-interpreter extension
// (Act 1), then uses it to analyze data (Act 2). Every line of agent-written
// code runs in the cloud — this script only orchestrates.
import 'dotenv/config'
import { Sandbox } from 'e2b'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

const { E2B_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY } = process.env
if (!E2B_API_KEY || !(OPENAI_API_KEY || ANTHROPIC_API_KEY)) {
  console.error('Set E2B_API_KEY plus OPENAI_API_KEY or ANTHROPIC_API_KEY in .env (see .env.example).')
  process.exit(1)
}
const model = OPENAI_API_KEY
  ? '--provider openai --model gpt-5.2'
  : '--provider anthropic --model claude-sonnet-5'

const HOME = '/home/user'
const EXT_DIR = `${HOME}/.pi/agent/extensions`
const EXT_FILE = `${EXT_DIR}/e2b-code-interpreter.ts`

const banner = (text: string) => console.log(`\n\x1b[1m━━ ${text}\x1b[0m`)

async function pi(sandbox: Sandbox, prompt: string) {
  return sandbox.commands.run(`cd ${HOME} && pi ${model} -p ${JSON.stringify(prompt)}`, {
    timeoutMs: 0,
    onStdout: (data) => process.stdout.write(data),
    onStderr: (data) => process.stderr.write(data),
  })
}

// ── setup: sandbox from the E2B 'pi' template ────────────────────────────────
banner("Setup: sandbox from the E2B 'pi' template")
const sandbox = await Sandbox.create('pi', {
  timeoutMs: 25 * 60 * 1000,
  envs: {
    E2B_API_KEY,
    ...(OPENAI_API_KEY ? { OPENAI_API_KEY } : {}),
    ...(ANTHROPIC_API_KEY ? { ANTHROPIC_API_KEY } : {}),
  },
})
console.log(`sandbox: ${sandbox.sandboxId}`)

await sandbox.files.write([
  { path: `${HOME}/data/sales.csv`, data: readFileSync(join(root, 'data/sales.csv'), 'utf8') },
  { path: `${HOME}/EXTENSION_SPEC.md`, data: readFileSync(join(root, 'EXTENSION_SPEC.md'), 'utf8') },
  { path: `${HOME}/reference-extension.ts`, data: readFileSync(join(root, 'extension/e2b-code-interpreter.ts'), 'utf8') },
  {
    path: `${EXT_DIR}/package.json`,
    data: JSON.stringify({ name: 'e2b-code-interpreter-ext', private: true, dependencies: { '@e2b/code-interpreter': '^2.0.0' } }),
  },
])
await sandbox.commands.run(`cd ${EXT_DIR} && npm install --omit=dev --no-fund --no-audit >/dev/null 2>&1`, {
  timeoutMs: 180_000,
})
console.log('staged: dataset, extension spec, extension dependencies')

// ── act 1: Pi builds its own tool ────────────────────────────────────────────
banner('Act 1: Pi builds its own E2B code-interpreter extension')
await pi(
  sandbox,
  `Read ${HOME}/EXTENSION_SPEC.md and build exactly the extension it describes, at ${EXT_FILE}. ` +
    'The spec contains every API you need — do not read, grep, or verify anything else. ' +
    'Its npm dependencies are already installed next to it. ' +
    'When the file is written, reply with one line: what you built.',
)

// The demo never hopes Act 1 worked: sanity-check the file Pi wrote and fall
// back to the reference implementation if it is broken. Act 2 runs either way.
const check = await sandbox.commands.run(
  `test -s ${EXT_FILE} && grep -q registerTool ${EXT_FILE} && grep -q run_python ${EXT_FILE} && echo OK || echo MISSING`,
)
if (check.stdout.trim() === 'OK') {
  console.log('\n✓ extension written by Pi — using the agent-built version')
} else {
  console.log("\n✗ Pi's extension didn't pass the sanity check — falling back to the reference copy")
  await sandbox.commands.run(`cp ${HOME}/reference-extension.ts ${EXT_FILE}`)
}

// ── act 2: Pi uses the tool it just built ────────────────────────────────────
banner('Act 2: Pi uses run_python (a second E2B sandbox) to analyze the data')
await pi(
  sandbox,
  'Explore data/sales.csv: how is revenue trending, and which region is growing fastest? ' +
    'Plot monthly revenue by region as a chart, then summarize what you see in a few sentences.',
)

// ── collect the charts the kernel produced ───────────────────────────────────
banner('Collecting charts')
const entries = await sandbox.files.list(`${HOME}/output`).catch(() => [])
await mkdir(join(root, 'output'), { recursive: true })
let downloaded = 0
for (const entry of entries) {
  if (!entry.name.endsWith('.png')) continue
  const bytes = await sandbox.files.read(entry.path, { format: 'bytes' })
  await writeFile(join(root, 'output', entry.name), Buffer.from(bytes))
  console.log(`downloaded output/${entry.name}`)
  downloaded += 1
}
if (downloaded === 0) console.log('no charts produced')

await sandbox.kill()
console.log('\nsandbox killed — done')
