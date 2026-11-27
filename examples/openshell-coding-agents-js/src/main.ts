// A small coding-agent fleet on E2B under NVIDIA OpenShell: two Claude Code workers
// and one Codex worker fix one bug each, in parallel, each in its own OpenShell sandbox.
//
//   npm start
//
// Each agent sees a placeholder key; OpenShell's supervisor adds the real key only to
// that agent's API host, for that agent's binary. Nothing else is reachable. This
// script does not trust the workers: only the assigned source file comes back, and the
// original test runs against it in a fresh E2B sandbox with no internet and no keys.
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CommandExitError, Sandbox } from 'e2b'
import { type Agent, PROFILES, agentCommand } from './agents.ts'
import { parseAudit, summarize } from './audit.ts'
import { checkSetup, createSandbox, exec, openshell, upload } from './openshell.ts'

const WORKERS = [
  { n: 1, agent: 'claude' as Agent, issue: '1-slugify', source: 'src/slugify.js', test: 'test/slugify.test.js' },
  { n: 2, agent: 'claude' as Agent, issue: '2-duration', source: 'src/duration.js', test: 'test/duration.test.js' },
  { n: 3, agent: 'codex' as Agent, issue: '3-csv', source: 'src/csv.js', test: 'test/csv.test.js' },
]
type Worker = (typeof WORKERS)[number]
const REPO_DIR = 'repo' // uploaded as /sandbox/repo
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5'
const AGENT_SECONDS = 600
const MAX_SOURCE_BYTES = 256 * 1024

const id = randomBytes(3).toString('hex') // names: agents-<id>-<n>, within OpenShell's 19 characters
const owned = { sandboxes: new Set<string>(), providers: new Set<string>() }

// The fixture's test/ folder as one string, to detect any change the agent made to it.
const testsOf = (read: (file: string) => string, files: string[]) => files.sort().map((f) => `== ${f}\n${read(f)}`).join('\n')
const fixtureTests = testsOf((f) => readFileSync(join(REPO_DIR, 'test', f), 'utf8'), readdirSync(join(REPO_DIR, 'test')))

async function grade(w: Worker, source: string): Promise<boolean> {
  const grader = await Sandbox.create({ allowInternetAccess: false, timeoutMs: 300_000 })
  try {
    const root = '/home/user/grade'
    for (const file of ['package.json', w.test]) {
      await grader.files.write(`${root}/${file}`, readFileSync(join(REPO_DIR, file), 'utf8'))
    }
    await grader.files.write(`${root}/${w.source}`, source)
    // A failing test is a result; any other error (SDK, network) is an error.
    const run = await grader.commands.run(`cd ${root} && timeout 60 node --test ${w.test} > /tmp/grade.txt 2>&1`, { timeoutMs: 90_000 })
      .catch((e: unknown) => {
        if (e instanceof CommandExitError) {
          return e
        }
        throw e
      })
    return run.exitCode === 0
  } finally {
    await grader.kill()
  }
}

async function work(w: Worker, provider: string) {
  const sandbox = `agents-${id}-${w.n}`
  const p = PROFILES[w.agent]
  const started = Date.now()
  const result = { ...w, sandbox, seconds: 0, agentExit: -1, fixed: false, testsEdited: false, ...summarize([], p.host, p.route), error: '' }
  const say = (text: string) => console.log(`[${w.n}] ${w.agent.padEnd(6)} ${text}`)
  try {
    say(`creating ${sandbox}: a supervisor VM and an agent VM`)
    try {
      await createSandbox(sandbox, provider)
    } catch (error) {
      // A name conflict means the sandbox is not ours; any other failure may have left ours behind.
      if (!/already exists/i.test((error as Error).message)) {
        owned.sandboxes.add(sandbox)
      }
      throw error
    }
    owned.sandboxes.add(sandbox)
    await upload(sandbox, REPO_DIR)
    const repo = `/sandbox/${REPO_DIR}`
    await exec(sandbox, `cd ${repo} && git init -q && git add -A && git -c user.email=fleet@fleet.example -c user.name=fleet commit -qm baseline`)
    const placeholder = (await exec(sandbox, `case "$${p.key}" in openshell:resolve:*) echo yes;; *) echo no;; esac`)).trim()
    if (placeholder !== 'yes') {
      throw new Error(`${p.key} in the sandbox is not an OpenShell placeholder`)
    }
    say(`${p.key} in the VM is a placeholder; working on issues/${w.issue}.md`)

    const out = await exec(sandbox, `cd ${repo} && timeout ${AGENT_SECONDS} ${agentCommand(w.agent, w.issue, CLAUDE_MODEL)} > /tmp/agent.txt 2>&1; echo "AGENT_EXIT=$?"; tail -n 30 /tmp/agent.txt`)
    result.agentExit = Number(/AGENT_EXIT=(\d+)/.exec(out)?.[1] ?? -1)
    writeFileSync(join('out', `${sandbox}-agent.txt`), out)

    // Only data comes back, and only the one file: regular, not a symlink, bounded.
    const source = await exec(sandbox, `f=${repo}/${w.source}; [ -f "$f" ] && [ ! -L "$f" ] && [ $(stat -c %s "$f") -le ${MAX_SOURCE_BYTES} ] && cat "$f"`)
    const tests = await exec(sandbox, `cd ${repo}/test && for f in $(ls -A | sort); do printf '== %s\\n' "$f"; head -c 65536 "$f"; printf '\\n'; done`)
    result.testsEdited = tests.trimEnd() !== fixtureTests.trimEnd()
    result.fixed = source !== readFileSync(join(REPO_DIR, w.source), 'utf8') && await grade(w, source)

    await new Promise((r) => setTimeout(r, 2000)) // the supervisor's records arrive shortly after
    const log = await openshell(['logs', sandbox, '-n', '20000'])
    writeFileSync(join('out', `${sandbox}-audit.log`), log)
    Object.assign(result, summarize(parseAudit(log), p.host, p.route))
    if (result.modelRequests === 0) {
      throw new Error(`audit inconclusive: no ${p.route} request recorded`)
    }
    say(`${result.fixed ? 'fixed' : 'NOT fixed'} · agent exit ${result.agentExit} · ${result.modelRequests} model requests · ${result.denied.length} denied`)
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    say(`error: ${result.error}`)
  }
  result.seconds = Math.round((Date.now() - started) / 1000)
  return result
}

async function main() {
  checkSetup()
  for (const key of ['E2B_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) {
    if (!process.env[key]) {
      throw new Error(`Set ${key} in .env`)
    }
  }
  mkdirSync('out', { recursive: true })
  const providers = {} as Record<Agent, string>
  for (const agent of ['claude', 'codex'] as Agent[]) {
    const p = PROFILES[agent]
    await openshell(['provider', 'profile', 'import', '-f', p.file, '--global']).catch((e: Error) => {
      if (!/already exists/i.test(e.message)) {
        throw e
      }
    })
    providers[agent] = `agents-${id}-${agent === 'claude' ? 'a' : 'o'}`
    // The key goes to the gateway through the CLI's environment, never its arguments.
    await openshell(['provider', 'create', '--name', providers[agent], '--type', p.type, '--from-existing'], { [p.key]: process.env[p.key] ?? '' })
    owned.providers.add(providers[agent])
  }

  const started = Date.now()
  const results = await Promise.all(WORKERS.map((w) => work(w, providers[w.agent])))
  const total = Math.round((Date.now() - started) / 1000)

  console.log(`\nResults (${total} s wall clock; graded with the original tests in a fresh offline sandbox)`)
  for (const r of results) {
    const ok = r.fixed && r.agentExit === 0 && !r.error
    console.log(`  ${ok ? '✓' : '✗'} [${r.n}] ${r.agent.padEnd(6)} ${r.issue.padEnd(11)} ${r.seconds} s${r.testsEdited ? '  (edited the tests; graded with the originals)' : ''}`)
  }
  console.log('\nOpenShell')
  for (const r of results) {
    const other = r.otherModelRoutes.length ? ` + ${r.otherModelRoutes.length} other API routes with the key` : ''
    const extra = r.unexpectedAllowed.length ? ` · ALSO ALLOWED: ${r.unexpectedAllowed.join(', ')}` : ''
    console.log(`  [${r.n}] ${r.agent.padEnd(6)} ${r.modelRequests} requests to ${PROFILES[r.agent].host}${other}${extra} · denied: ${r.denied.join(', ') || 'none'}`)
  }
  writeFileSync(join('out', `agents-${id}.json`), `${JSON.stringify({ id, total, results }, null, 2)}\n`)
  console.log(`\nReceipt: out/agents-${id}.json`)
  if (!results.every((r) => r.fixed && r.agentExit === 0 && !r.error && r.unexpectedAllowed.length === 0)) {
    process.exitCode = 1
  }
}

// One cleanup path for normal exit, errors and Ctrl+C. Deletes only what this run created.
let cleaning: Promise<void> | undefined
function cleanup() {
  cleaning ??= (async () => {
    const left: string[] = []
    const remove = async (args: string[]) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await openshell(args)
          return
        } catch (e) {
          if (/not found/i.test((e as Error).message)) {
            return
          }
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      left.push(`${args[0]} ${args[2]}`)
    }
    await Promise.all([...owned.sandboxes].map((s) => remove(['sandbox', 'delete', s])))
    await Promise.all([...owned.providers].map((p) => remove(['provider', 'delete', p])))
    if (left.length) {
      console.error(`Not deleted: ${left.join(', ')}`)
      process.exitCode = 1
    } else {
      console.log('Sandboxes and providers deleted.')
    }
  })()
  return cleaning
}
process.once('SIGINT', () => {
  process.exitCode = 130
  void cleanup().finally(() => process.exit())
})

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await cleanup()
}
