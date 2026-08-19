import 'dotenv/config'
import { CommandExitError, Sandbox } from 'e2b'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

const { E2B_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY } = process.env
if (!E2B_API_KEY || !(OPENAI_API_KEY || ANTHROPIC_API_KEY)) {
  console.error('Set E2B_API_KEY plus OPENAI_API_KEY or ANTHROPIC_API_KEY in .env (see .env.example).')
  process.exit(1)
}
const modelArgs = OPENAI_API_KEY
  ? '--provider openai --model gpt-5.6-luna'
  : '--provider anthropic --model claude-sonnet-5'

const SANDBOX_HOME = '/home/user'
const EXTENSION_DIR = `${SANDBOX_HOME}/.pi/agent/extensions`
const EXTENSION_FILE = `${EXTENSION_DIR}/e2b-code-interpreter.ts`

const banner = (text: string) => console.log(`\n\x1b[1m━━ ${text}\x1b[0m`)

async function runPi(sandbox: Sandbox, prompt: string) {
  return sandbox.commands.run(`cd ${SANDBOX_HOME} && pi ${modelArgs} -p ${JSON.stringify(prompt)}`, {
    timeoutMs: 0,
    onStdout: (data) => process.stdout.write(data),
    onStderr: (data) => process.stderr.write(data),
  })
}

async function main() {
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

  try {
    await sandbox.files.write([
      {
        path: `${SANDBOX_HOME}/data/sales.csv`,
        data: readFileSync(join(root, 'data/sales.csv'), 'utf8'),
      },
      {
        path: `${SANDBOX_HOME}/EXTENSION_SPEC.md`,
        data: readFileSync(join(root, 'EXTENSION_SPEC.md'), 'utf8'),
      },
      {
        path: `${SANDBOX_HOME}/reference-extension.ts`,
        data: readFileSync(join(root, 'extension/e2b-code-interpreter.ts'), 'utf8'),
      },
      {
        path: `${EXTENSION_DIR}/package.json`,
        data: JSON.stringify({
          name: 'e2b-code-interpreter-ext',
          private: true,
          dependencies: { '@e2b/code-interpreter': '^2.0.0' },
        }),
      },
    ])

    // The E2B SDK throws CommandExitError on any non-zero exit, so a failed
    // install fails this run loudly on its own.
    await sandbox.commands.run(
      `cd ${EXTENSION_DIR} && npm install --omit=dev --no-fund --no-audit`,
      { timeoutMs: 180_000 },
    )
    console.log('staged: dataset, extension spec, extension dependencies')

    banner('Act 1: Pi builds its own E2B code-interpreter extension')
    await runPi(
      sandbox,
      `Read ${SANDBOX_HOME}/EXTENSION_SPEC.md and build exactly the extension it describes, at ${EXTENSION_FILE}. ` +
        'The spec contains every API you need — do not read, grep, or verify anything else. ' +
        'Its npm dependencies are already installed next to it. ' +
        'When the file is written, reply with one line: what you built.',
    )

    try {
      // commands.run throws CommandExitError on non-zero exit, so a failed
      // check lands in the catch below rather than returning an exit code.
      await sandbox.commands.run(
        `test -s ${EXTENSION_FILE} && grep -q registerTool ${EXTENSION_FILE} && grep -q run_python ${EXTENSION_FILE}`,
      )
      console.log('\n✓ extension written by Pi — using the agent-built version')
    } catch (error) {
      if (!(error instanceof CommandExitError)) throw error
      console.log("\n✗ Pi's extension didn't pass the sanity check — falling back to the reference copy")
      await sandbox.commands.run(`cp ${SANDBOX_HOME}/reference-extension.ts ${EXTENSION_FILE}`)
    }

    banner('Act 2: Pi uses run_python (a second E2B sandbox) to analyze the data')
    await runPi(
      sandbox,
      'Explore data/sales.csv: how is revenue trending, and which region is growing fastest? ' +
        'Plot monthly revenue by region as a chart, then summarize what you see in a few sentences.',
    )

    banner('Collecting charts')
    const entries = await sandbox.files.list(`${SANDBOX_HOME}/output`).catch(() => [])
    const charts = entries.filter((entry) => entry.name.endsWith('.png'))
    if (charts.length === 0) {
      console.log('no charts produced')
      return
    }

    const outputDir = join(root, 'output')
    await mkdir(outputDir, { recursive: true })
    for (const chart of charts) {
      const bytes = await sandbox.files.read(chart.path, { format: 'bytes' })
      await writeFile(join(outputDir, chart.name), Buffer.from(bytes))
      console.log(`downloaded output/${chart.name}`)
    }
  } finally {
    await sandbox.kill()
    console.log('\nsandbox killed — done')
  }
}

await main()
