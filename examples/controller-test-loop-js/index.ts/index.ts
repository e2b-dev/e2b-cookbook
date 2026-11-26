// controller-test-loop-js — run a deterministic game-agent controller test
// loop inside an E2B sandbox.
//
// The pattern is a reusable workflow, not a single-product integration:
//   1. upload a controller (any file implementing draft/hello/tick)
//   2. fetch the arena simulator + test harness for the game under test
//   3. run the harness in the sandbox and stream the results back
//   4. the loop fails loudly if the controller throws or the gates fail
//
// Swap controller.js + the SDK URL below for any other turn-based game and
// the same loop evaluates that controller instead. The tank arena here
// (battle.training, Season 2) is one example workload.
//
// Run:  npm install && npm start
// Needs: E2B_API_KEY in .env (free tier at https://e2b.dev works).
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import Sandbox from 'e2b'

const CONTROLLER = './controller.js'
// The ladder's own simulator + harness, fetched at run time so the PR does
// not vendor the engine (same curls the harness header documents):
//   curl -O https://api.battle.training/sdk/arena-sim.mjs
//   curl -O https://api.battle.training/sdk/local-test.mjs
const SDK_BASE = 'https://api.battle.training/sdk'
const SEEDS = Number(process.env.SEEDS ?? 20)
const OPPONENTS = process.env.VS ?? 'brawler,holder,random'

async function run() {
  if (!process.env.E2B_API_KEY) {
    throw new Error('E2B_API_KEY is missing — copy .env.example to .env and add your key')
  }
  const controller = readFileSync(CONTROLLER, 'utf8')
  if (controller.length < 100) throw new Error('controller.js looks empty')

  console.log('Creating E2B sandbox...')
  const sbx = await Sandbox.create({ timeoutMs: 600_000 })

  try {
    const node = await sbx.commands.run('node --version')
    console.log(`sandbox node: ${node.stdout.trim()}`)

    // Upload the controller under test.
    await sbx.files.write('/home/user/controller.js', controller)

    // Fetch the simulator + harness inside the sandbox, then run the loop.
    // local-test.mjs runs the controller against the house bots on many
    // seeds, from both sides, exactly as the ladder does, and prints win
    // rate, damage and failure stats. A tick() that throws is counted, so
    // a controller that never runs cannot pass for a weak one.
    const cmd = [
      `curl -fsSL -O ${SDK_BASE}/arena-sim.mjs`,
      `curl -fsSL -O ${SDK_BASE}/local-test.mjs`,
      `node local-test.mjs ./controller.js --seeds ${SEEDS} --vs ${OPPONENTS}`,
    ].join(' && ')
    console.log(`running test loop: ${SEEDS} seeds vs ${OPPONENTS}`)
    const result = await sbx.commands.run(cmd, {
      timeoutMs: 0,
      onStdout: (data: string) => { process.stdout.write(data) },
      onStderr: (data: string) => { process.stderr.write(data) },
    })
    console.log(`\ntest loop exit code: ${result.exitCode}`)
    if (result.exitCode !== 0) {
      throw new Error(`controller test loop failed (exit ${result.exitCode})`)
    }
    console.log('GATE: PASS — loop completed, see win rate above.')
  } finally {
    await sbx.kill()
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
