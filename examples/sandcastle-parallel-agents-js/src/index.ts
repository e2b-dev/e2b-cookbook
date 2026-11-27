import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeCode, run } from '@ai-hero/sandcastle'
import { e2b } from '@ai-hero/sandcastle/sandboxes/e2b'

for (const key of ['E2B_API_KEY', 'ANTHROPIC_API_KEY']) {
  if (!process.env[key]) throw new Error(`Set ${key} in .env`)
}
const anthropicApiKey = process.env.ANTHROPIC_API_KEY!
const model = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5-5'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

// Sandcastle works on a local git repository. Copy the demo project into a
// fresh one so every run starts from the same two failing tests.
const repo = mkdtempSync(join(tmpdir(), 'sandcastle-demo-'))
cpSync(new URL('../demo-project', import.meta.url), repo, { recursive: true })
git(repo, 'init', '-q', '-b', 'main')
// Sandcastle passes this identity to the agent for its commits
git(repo, 'config', 'user.name', 'Sandcastle demo')
git(repo, 'config', 'user.email', 'demo@example.com')
git(repo, 'add', '.')
git(repo, 'commit', '-qm', 'Initial commit')
console.log(`Demo repo: ${repo}`)

const tasks = [
  {
    branch: 'agent/fix-slugify',
    prompt: 'The slugify test fails. Fix src/slugify.js so `npm test -- test/slugify.test.js` passes, then commit the fix. Do not touch other files.',
  },
  {
    branch: 'agent/add-median',
    prompt: 'Implement median() in src/stats.js so `npm test -- test/stats.test.js` passes, then commit it. Do not touch other files.',
  },
]

// Each run() gets its own E2B sandbox: Sandcastle copies the repo in, runs
// Claude Code there, brings the agent's commits back to the named branch on
// this machine, and kills the sandbox.
const results = await Promise.allSettled(
  tasks.map((task) =>
    run({
      cwd: repo,
      name: task.branch,
      agent: claudeCode(model, { env: { ANTHROPIC_API_KEY: anthropicApiKey } }),
      // The prebuilt `claude` template ships the Claude Code CLI
      sandbox: e2b({ template: 'claude', timeoutMs: 15 * 60_000 }),
      branchStrategy: { type: 'branch', branch: task.branch },
      prompt: task.prompt,
    }),
  ),
)

for (const [i, result] of results.entries()) {
  const { branch } = tasks[i]
  if (result.status === 'rejected') {
    console.error(`${branch}: run failed: ${result.reason}`)
    process.exitCode = 1
    continue
  }
  console.log(`\n${branch}: ${result.value.commits.length} commit(s)`)
  console.log(git(repo, 'log', '--oneline', `main..${branch}`))
  console.log(git(repo, 'diff', '--stat', `main...${branch}`))
}

if (process.exitCode !== 1) {
  // Both branches touch different files, so they merge cleanly
  git(repo, 'merge', '-q', '--no-edit', ...tasks.map((t) => t.branch))
  try {
    execFileSync('npm', ['test'], { cwd: repo, stdio: 'pipe' })
    console.log('\nAll tests pass on main after merging both branches.')
  } catch (err) {
    console.error('\nTests still fail after merging:\n' + String((err as { stdout?: Buffer }).stdout ?? err))
    process.exitCode = 1
  }
}
