/**
 * Integration runner for the cookbook examples.
 *
 * Each example is uploaded into a fresh E2B sandbox and executed there with the
 * toolchain its manifest implies. An example passes if its command exits 0.
 *
 * This used to be a Jest suite. Jest's module runtime cannot load the current
 * e2b SDK: e2b depends on chalk 5 and four other ESM-only packages, and while
 * Node 22+ resolves those fine from both CJS and ESM, Jest's own runtime does
 * not implement `require(esm)`. Rather than fight that, the runner is a plain
 * script. It still writes tests/results.json, which tests/report.mjs turns into
 * the artifact table and the Slack payload.
 */
import { promises as fs } from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { Sandbox } from 'e2b'

import { uploadPathToPath, getApiKeys } from './utils'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

type Interpreter = 'npm' | 'poetry' | 'jupyter' | 'uv'

const scripts: {
  name: string
  interpreter: Interpreter
  file: string
  // Providers that rate-limit per organisation. Examples sharing a provider are
  // serialised against each other, so they never compete for the same quota
  // window. That is not enough on its own: the Groq org is capped at 100k tokens
  // per DAY on this tier ("tokens per day (TPD): Limit 100000, Used 99952"), which
  // no retry policy can work around, so the Groq example count is deliberately
  // held at two. See the exclusion note below before adding a third.
  provider?: string
  // What to pass after `uv run` / `poetry run`. Defaults to main.py for uv and
  // the `start` console script for poetry. Can be a path, a script name, or
  // `python -m pkg.mod` for packages whose entry uses absolute imports.
  entrypoint?: string
}[] = [
  { name: 'hello-world-js', interpreter: 'npm', file: './examples/hello-world-js/' },
  { name: 'claude-code-interpreter-js', interpreter: 'npm', file: './examples/claude-code-interpreter-js/' },
  { name: 'firecrawl-scrape-and-analyze-airbnb-data', interpreter: 'npm', file: './examples/firecrawl-scrape-and-analyze-airbnb-data/' },
  { name: 'together-ai-code-interpreter-js', interpreter: 'npm', file: './examples/together-ai-code-interpreter-js' },
  { name: 'groq-code-interpreter-python', provider: 'groq', interpreter: 'jupyter', file: './examples/groq-code-interpreter-python/llama_3_code_interpreter.ipynb' },
  { name: 'o1-code-interpreter-python', interpreter: 'jupyter', file: './examples/o1-and-gpt-4-python/o1.ipynb' },
  { name: 'codestral-code-interpreter-js', interpreter: 'npm', file: './examples/codestral-code-interpreter-js/' },
  { name: 'gpt-4o-code-interpreter-js', interpreter: 'npm', file: './examples/gpt-4o-js/' },
  { name: 'codestral-code-interpreter-python', interpreter: 'jupyter', file: './examples/codestral-code-interpreter-python/codestral_code_interpreter.ipynb' },
  { name: 'hello-world-python', interpreter: 'poetry', file: './examples/hello-world-python/' },
  { name: 'o1-code-interpreter-js', interpreter: 'npm', file: './examples/o1-and-gpt-4-js/' },
  { name: 'gpt-4o-code-interpreter', interpreter: 'jupyter', file: './examples/gpt-4o-python/gpt_4o.ipynb' },
  { name: 'together-ai-code-interpreter-python', interpreter: 'jupyter', file: './examples/together-ai-code-interpreter-python/together_with_e2b_code_interpreter.ipynb' },
  { name: 'langchain-python', interpreter: 'poetry', file: './examples/langchain-python/' },
  { name: 'langgraph-python', interpreter: 'poetry', file: './examples/langgraph-python/' },
  { name: 'claude-code-interpreter-python', interpreter: 'jupyter', file: './examples/claude-code-interpreter-python/claude_code_interpreter.ipynb' },
  { name: 'claude-visualize-website-topics', interpreter: 'jupyter', file: './examples/claude-visualize-website-topics/claude-visualize-website-topics.ipynb' },
  { name: 'mcp-client-js', interpreter: 'npm', file: './examples/mcp-client-js/' },
  { name: 'mcp-custom-server-js', interpreter: 'npm', file: './examples/mcp-custom-server-js/' },
  { name: 'mcp-claude-code-js', interpreter: 'npm', file: './examples/mcp-claude-code-js/' },
  { name: 'mcp-groq-exa-js', provider: 'groq', interpreter: 'npm', file: './examples/mcp-groq-exa-js/' },
  { name: 'openai-js', interpreter: 'npm', file: './examples/openai-js/' },
  { name: 'openai-python', interpreter: 'jupyter', file: './examples/openai-python/openai.ipynb' },
  { name: 'custom-sandbox-domain-proxy', interpreter: 'npm', file: './examples/custom-sandbox-domain-proxy/' },
  { name: 'crewai-python', interpreter: 'uv', file: './examples/crewai-python/' },
  { name: 'playwright-in-e2b', interpreter: 'npm', file: './examples/playwright-in-e2b/' },
  { name: 'anthropic-claude-code-in-sandbox-js', interpreter: 'npm', file: './examples/anthropic-claude-code-in-sandbox-js/' },
  { name: 'anthropic-claude-code-in-sandbox-python', interpreter: 'uv', file: './examples/anthropic-claude-code-in-sandbox-python/', entrypoint: 'python -m anthropic_claude_code_in_sandbox.main' },
  { name: 'mcp-custom-template-js', interpreter: 'npm', file: './examples/mcp-custom-template-js/' },
  { name: 'docker-in-e2b-js', interpreter: 'npm', file: './examples/docker-in-e2b/js/' },
  { name: 'docker-in-e2b-python', interpreter: 'poetry', file: './examples/docker-in-e2b/python/', entrypoint: 'python main.py' },
]

// Deliberately not covered, and why. Anything not listed here should be added above.
//
// Blocked upstream: the third-party `sandbox-agent` package (0.4.2, latest) calls
// Sandbox.betaCreate(), which the E2B SDK removed between 2.20 and 2.30. It cannot
// run against any current SDK, and was already failing on main for this reason:
//   sandbox-agent-sdk-js
// Multiple projects in one directory. docker-in-e2b is covered as two entries
// pointing at its js/ and python/ subdirectories; anthropic-managed-agents is not,
// because its subprojects are multi-command CLI toolkits (build-template,
// create-agent, send, start-worker) with no single thing to assert:
//   anthropic-managed-agents (javascript/ + python/)
// No single entrypoint, and not runnable standalone: basic.py does
// sys.path.insert(...parents[4]) and imports examples.sandbox.misc.example_support,
// so it expects to run inside the openai-agents-python repo, not here:
//   openai-agents-sdk (11 standalone scripts, no manifest)
// The Codex CLI the template installs (v0.147.0) no longer authenticates from
// OPENAI_API_KEY in the environment: it reports "Missing bearer or basic
// authentication in header" against wss://api.openai.com/v1/responses, i.e. no
// auth header is sent at all, so it now expects `codex login` or an explicit
// credential rather than an env var. The examples still pass the key as an env,
// which was correct for older Codex. Fixing this needs someone who can iterate
// against the current CLI - either pin Codex in the template or wire its current
// auth - so it is not guessed at here:
//   openai-codex-in-sandbox-js, openai-codex-in-sandbox-python
// Dropped to fit the Groq quota, NOT because they are broken - both pass when the
// day's budget allows, and they should be restored if the tier is raised. The org
// is capped at 100k tokens per day and four Groq examples several calls each do not
// fit, so the two carrying the least distinct information come out:
// groq-code-interpreter-js is the same demo as its Python twin, which stays, and
// upload-dataset-code-interpreter is a third Groq chart demo.
// groq-code-interpreter-python and mcp-groq-exa-js remain, covering the two
// different SDK surfaces:
//   groq-code-interpreter-js, upload-dataset-code-interpreter
// Calls a model the Fireworks account cannot reach: qwen2p5-coder-32b-instruct
// returns 404 "Model not found, inaccessible, and/or not deployed", which does not
// distinguish a retired model from one this account has not deployed. Needs someone
// with the Fireworks account to pick a current model, then move it back up:
//   fireworks-code-interpreter-python
// Needs a provider secret this repo does not have. `gh secret list` shows only
// ANTHROPIC, E2B, FIRECRAWL, FIREWORKS, GROQ, MISTRAL, OPENAI and TOGETHER, so
// these can only ever fail on a missing key rather than on anything real. Add
// the secret and move them back up:
//   watsonx-ai-code-interpreter-js / -python (WATSONX_API_KEY, _PROJECT_ID, _URL)
//   mcp-browserbase-js (BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, GEMINI_API_KEY)
//   mcp-research-agent-js (EXA_API_KEY)
//   stirrup-python (its own auth header)
// Runs a long-lived agent/server process rather than a script that exits, so
// this runner can only ever time out on them:
//   flue-feedback-analyst-js, vercel-eve-feedback-analyst-js,
//   nextjs-code-interpreter (next start), agentkit-coding-agent

const SANDBOX_TEST_DIRECTORY = '/home/user/example'
const LOGS_DIRECTORY = 'logs'
const SANDBOX_TIMEOUT = 300_000
const COMMAND_TIMEOUT = 150_000
const MAX_ATTEMPTS = 3
const CONCURRENCY = 5

// Examples that legitimately need longer than COMMAND_TIMEOUT. mcp-custom-server-js
// clones and builds a filesystem MCP server from GitHub inside the sandbox before
// it can do anything, and does not fit the shared budget.
const TIMEOUT_OVERRIDES: Record<string, number> = {
  'mcp-custom-server-js': 600_000,
  // Both hand a real task to an agent CLI (Codex, Playwright driving a browser)
  // running inside the sandbox, which does not fit the shared budget.
  'openai-codex-in-sandbox-js': 600_000,
  'openai-codex-in-sandbox-python': 600_000,
  'playwright-in-e2b': 300_000,
}

// Examples that run from a custom template need it built on the account first.
// Only the prod builds are listed: every `:dev` script builds a `<alias>-dev`
// template that no example actually creates a sandbox from.
//
// Two aliases are shared, which is why builds are keyed by alias rather than by
// example: anthropic-claude-code is built by both the js and python siblings,
// e2b-with-docker by both docker-in-e2b subprojects, and
// openai-codex-in-sandbox-js has no build script at all - it relies on the
// python sibling's. Building per example would race two builds of one alias.
type TemplateBuild = {
  alias: string
  dir: string
  interpreter: Interpreter
  build: string
}

// example name -> template alias it creates a sandbox from
const TEMPLATE_USED_BY: Record<string, string> = {
  'playwright-in-e2b': 'playwright-chromium',
  'anthropic-claude-code-in-sandbox-js': 'anthropic-claude-code',
  'anthropic-claude-code-in-sandbox-python': 'anthropic-claude-code',
  'openai-codex-in-sandbox-js': 'openai-codex',
  'openai-codex-in-sandbox-python': 'openai-codex',
  'mcp-custom-template-js': 'browserbase-mcp-gateway',
  'docker-in-e2b-js': 'e2b-with-docker',
  'docker-in-e2b-python': 'e2b-with-docker',
}

const TEMPLATE_BUILDS: TemplateBuild[] = [
  { alias: 'playwright-chromium', dir: './examples/playwright-in-e2b/', interpreter: 'npm', build: 'npm run e2b:build:prod' },
  { alias: 'anthropic-claude-code', dir: './examples/anthropic-claude-code-in-sandbox-js/', interpreter: 'npm', build: 'npm run e2b:build:prod' },
  { alias: 'e2b-with-docker', dir: './examples/docker-in-e2b/js/', interpreter: 'npm', build: 'npm run e2b:build:prod' },
  { alias: 'browserbase-mcp-gateway', dir: './examples/mcp-custom-template-js/', interpreter: 'npm', build: 'npm run build' },
  { alias: 'openai-codex', dir: './examples/openai-codex-in-sandbox-python/', interpreter: 'uv', build: 'uv run build_prod.py' },
]

// A template build is minutes, not seconds, and the result persists on the
// account, so we probe first and only build what is missing.
//
// The probe answers "does this alias exist", not "is it current", and that
// distinction bites: the anthropic-claude-code template already existed on the CI
// account, built with a Claude Code version whose default model is now retired,
// so the example failed with `404 model: claude-sonnet-4-20250514` for a model id
// that appears nowhere in this repo. Templates that bundle a fast-moving agent CLI
// go stale by construction. REBUILD_TEMPLATES=1 forces a rebuild and is the only
// way to refresh one - worth running periodically, not just after editing a
// template definition.
const TEMPLATE_BUILD_TIMEOUT = 900_000

async function templateExists(alias: string): Promise<boolean> {
  try {
    const probe = await Sandbox.create(alias, { timeoutMs: 60_000 })
    await probe.kill().catch(() => {})
    return true
  } catch {
    return false
  }
}

async function buildTemplates(logsDir: string, needed: Set<string>): Promise<string[]> {
  const failed: string[] = []
  const force = process.env.REBUILD_TEMPLATES === '1'

  for (const spec of TEMPLATE_BUILDS.filter((t) => needed.has(t.alias))) {
    if (!force && (await templateExists(spec.alias))) {
      console.log(`TEMPLATE ${spec.alias} already exists, skipping build`)
      continue
    }
    console.log(`TEMPLATE building ${spec.alias} (this takes minutes)`)
    const logFilePath = path.join(logsDir, `template-${spec.alias}.txt`)
    const sandbox = await Sandbox.create({ timeoutMs: TEMPLATE_BUILD_TIMEOUT + 60_000 })
    try {
      await uploadPathToPath(spec.dir, SANDBOX_TEST_DIRECTORY, sandbox)
      const setup =
        spec.interpreter === 'uv'
          ? ['pip install --quiet uv', 'PATH=/home/user/.local/bin/:$PATH', `cd ${SANDBOX_TEST_DIRECTORY}`, 'uv sync']
          : [`cd ${SANDBOX_TEST_DIRECTORY}`, 'npm install']
      await sandbox.commands.run([...setup, spec.build].join(' && '), {
        onStdout: async (o) => { await fs.appendFile(logFilePath, o) },
        onStderr: async (o) => { await fs.appendFile(logFilePath, o) },
        envs: getApiKeys(),
        timeoutMs: TEMPLATE_BUILD_TIMEOUT,
      })
      console.log(`TEMPLATE ${spec.alias} built`)
    } catch (error: any) {
      const detail = `${error?.message ?? error}\n${error?.result?.stderr ?? ''}`
      await fs.appendFile(logFilePath, `\nBuild failed:\n${detail}\n`)
      console.log(`TEMPLATE ${spec.alias} FAILED to build - examples using it will fail`)
      failed.push(spec.alias)
    } finally {
      await sandbox.kill().catch(() => {})
    }
  }
  return failed
}

// One in-flight example per provider. The chain is per provider, so examples
// with no provider tag - and examples of different providers - still run at the
// full CONCURRENCY.
const providerChain = new Map<string, Promise<void>>()

async function withProviderLock<T>(provider: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!provider) return fn()
  const previous = providerChain.get(provider) ?? Promise.resolve()
  let release!: () => void
  providerChain.set(provider, previous.then(() => new Promise<void>((r) => (release = r))))
  await previous
  try {
    return await fn()
  } finally {
    release()
  }
}

// A deterministic failure will fail identically on every retry, so only retry
// the transient ones. The old suite retried everything three times, which
// tripled sandbox time and provider spend on already-doomed runs.
//
// tool_use_failed is the exception to "400s are deterministic": it means the
// model emitted a malformed tool call (Groq's llama-3.3 sometimes returns
// `<function=name,{...}</function>` instead of tool-call JSON). That varies run
// to run with identical code, so it is worth retrying, unlike a bad model id or
// an unsupported parameter.
function isRetryable(output: string): boolean {
  return /rate limit|429|50[023]|deadline_exceeded|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|temporarily unavailable|APIConnectionError|Connection error|connection reset|socket hang up|tool_use_failed|Failed to call a function/i.test(output)
}

function testScript(interpreter: Interpreter, notebookPath: string, entrypoint?: string): string[] {
  const INSTALL_POETRY_COMMAND = 'curl -sSL https://install.python-poetry.org | python3 -'
  // Installed from PyPI rather than `curl | sh`: this sandbox is handed provider
  // API keys a moment later, so an unpinned remote script does not belong here.
  const INSTALL_UV_COMMAND = 'pip install --quiet uv'
  const SET_PATH_COMMAND = 'PATH=/home/user/.local/bin/:$PATH'

  // A uv / PEP-621 project. Entrypoint is main.py by convention.
  if (interpreter === 'uv') {
    return [INSTALL_UV_COMMAND, SET_PATH_COMMAND, `cd ${SANDBOX_TEST_DIRECTORY}`, 'uv sync', `uv run ${entrypoint ?? 'main.py'}`]
  }

  // A Jupyter notebook, executed in a Poetry environment.
  if (interpreter === 'jupyter') {
    return [
      INSTALL_POETRY_COMMAND,
      SET_PATH_COMMAND,
      'poetry init --name my_project --python "^3.10" -n',
      'poetry add jupyter nbconvert pip python-dotenv',
      `poetry run jupyter nbconvert --debug --to markdown --execute --stdout ${notebookPath}`,
    ]
  }

  // A Poetry project.
  if (interpreter === 'poetry') {
    return [
      INSTALL_POETRY_COMMAND,
      SET_PATH_COMMAND,
      `cd ${SANDBOX_TEST_DIRECTORY}`,
      // --no-root: these are scripts, and installing the project itself trips on
      // metadata that refers outside the uploaded directory (docker-in-e2b/python
      // declares readme = "README.md", which lives in its parent).
      'poetry install --no-root',
      `poetry run ${entrypoint ?? 'start'}`,
    ]
  }

  // A NodeJS project.
  if (interpreter === 'npm') {
    return [`cd ${SANDBOX_TEST_DIRECTORY}`, 'npm install', 'npm run start']
  }

  return []
}

type Verdict = 'pass' | 'skip' | 'fail'
type Outcome = { name: string; verdict: Verdict; durationMs: number; failure: string; rateLimited?: boolean }

// What this suite is actually for: proving the sandbox worked. Created, files
// uploaded, the toolchain installed, commands executed, results returned, killed.
//
// Whether the model wrote good code is not part of that contract and is not
// deterministic - the same example passes and fails on consecutive runs with
// identical code. So an outcome that is clearly the model's behaviour rather than
// the sandbox's is reported as skipped: visible in the summary, not counted as a
// failure, and it does not turn the job red.
//
// The dividing line: if the code reached the sandbox and ran, the sandbox did its
// job, whatever the code then did. If the example never got that far - SDK error,
// missing template, upload failure, dependency resolution, a timeout waiting on
// the sandbox - that is a real failure.
// An exhausted account is not model behaviour, it is a configuration problem that
// stays broken until a human tops up, so it must fail rather than skip. It arrives
// as a 429 like a rate limit does, which is exactly how it slipped through: nine
// examples skipped on "You have no credits remaining" and the run went green.
// Checked before MODEL_SIDE, because these strings also match it.
// Rate limiting and quota exhaustion count as OK. The runner's job is to prove the
// sandbox worked, and a provider refusing to serve tokens says nothing about that -
// the sandbox was created, the example installed and ran, and the request left the
// box and got an answer. Whether that answer was a completion or a 429 is the
// provider's business.
//
// This deliberately includes an exhausted account balance ("no credits remaining",
// insufficient_quota), which is a 429 and would otherwise need a human to top up.
// The consequence is real and worth knowing: the suite reports OK while the account
// is dry. That is why rate-limited examples are still counted separately and named
// in the summary rather than folded silently into the pass list.
const RATE_LIMITED = [
  /rate limit|\b429\b|tokens per day|overloaded|no credits remaining/i,
  /insufficient_quota|exceeded your current quota|quota exceeded/i,
]

// Non-deterministic model behaviour. The sandbox ran the code; the model just did
// something different this time. Reported as skipped.
const MODEL_SIDE = [
  // The model emitted a malformed tool call, or none at all.
  /tool_use_failed|Failed to call a function|did not call |returned no tool call/i,
  // The model produced nothing displayable - guarded in the examples, but some
  // print it and exit non-zero.
  /No displayable result|No chart in the result|No PNG data|No code interpreter results/i,
  // Code the model generated raised inside the sandbox. The sandbox executed it
  // and faithfully returned the error, which is the behaviour we want.
  // Anchored to a real emission: nbconvert echoes the failing cell's source into
  // the log, so an unanchored match also fired on the notebook's own
  // `print("[Code Interpreter ERROR]", exec.error)` line and misread a 404 as
  // model behaviour.
  /\[Code Interpreter ERROR\][^"')\n]{3,}|AI-generated Python runtime error/i,
]

function classify(output: string): Verdict {
  if (RATE_LIMITED.some((r) => r.test(output))) return 'pass'
  if (MODEL_SIDE.some((r) => r.test(output))) return 'skip'
  return 'fail'
}

async function runOne(
  { name, interpreter, file: examplePath, entrypoint }: (typeof scripts)[number],
  logsDir: string,
): Promise<Outcome> {
  const startedAt = Date.now()
  const logFilePath = path.join(logsDir, `${name}.txt`)
  let lastFailure = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const sandbox = await Sandbox.create({
      timeoutMs: Math.max(SANDBOX_TIMEOUT, (TIMEOUT_OVERRIDES[name] ?? COMMAND_TIMEOUT) + 60_000),
    })
    let stderrData = ''

    try {
      await uploadPathToPath(examplePath, SANDBOX_TEST_DIRECTORY, sandbox)

      const notebookPath = path.posix.join(SANDBOX_TEST_DIRECTORY, path.basename(examplePath))
      const command = testScript(interpreter, notebookPath, entrypoint).join(' && ')

      await sandbox.commands.run(command, {
        onStderr: async (output) => {
          stderrData += output
          await fs.appendFile(logFilePath, output)
        },
        onStdout: async (output) => {
          await fs.appendFile(logFilePath, output)
        },
        envs: getApiKeys(),
        timeoutMs: TIMEOUT_OVERRIDES[name] ?? COMMAND_TIMEOUT,
      })

      console.log(`PASS  ${name} (attempt ${attempt})`)
      await fs.appendFile(logFilePath, `\nPASS on attempt ${attempt}\n`)
      return { name, verdict: 'pass', durationMs: Date.now() - startedAt, failure: '' }
    } catch (error: any) {
      // commands.run throws CommandExitError on a non-zero exit, so this is the
      // path a failing example actually takes. Record enough to diagnose it.
      const detail = `${error?.message ?? error}\n${error?.result?.stderr ?? stderrData}`
      lastFailure = detail
      await fs.appendFile(logFilePath, `\nAttempt ${attempt}/${MAX_ATTEMPTS} failed:\n${detail}\n`)

      // Go through classify() rather than testing MODEL_SIDE here, so precedence
      // lives in exactly one place. Testing MODEL_SIDE directly meant an output
      // containing both a 429 and a model-side pattern - which is what a rate
      // limited notebook produces, since nbconvert reports the cell error too -
      // short-circuited to skip before the rate limit was ever considered.
      // Only a settled skip returns early; a rate limit falls through to the
      // retries below, because its window often clears.
      if (classify(detail) === 'skip') {
        console.log(`SKIP  ${name} (the model's behaviour, not the sandbox)`)
        await fs.appendFile(logFilePath, `\nSKIPPED: classified as model-side, not a sandbox failure\n`)
        return { name, verdict: 'skip', durationMs: Date.now() - startedAt, failure: detail.slice(0, 4000) }
      }

      if (!isRetryable(detail)) {
        console.log(`FAIL  ${name} (attempt ${attempt}, not retryable)`)
        break
      }
      const backoffMs = 10_000 * 3 ** (attempt - 1)   // 10s, 30s, 90s
      console.log(`RETRY ${name} in ${backoffMs / 1000}s (attempt ${attempt} hit a transient error)`)
      await new Promise((r) => setTimeout(r, backoffMs))
    } finally {
      await sandbox.kill().catch(() => {})
    }
  }

  const verdict = classify(lastFailure)
  const rateLimited = verdict === 'pass'
  console.log(
    rateLimited
      ? `OK    ${name} (rate limited or out of quota - the sandbox ran, the provider refused)`
      : verdict === 'skip'
        ? `SKIP  ${name} (the model's behaviour, not the sandbox)`
        : `FAIL  ${name}`,
  )
  if (rateLimited) {
    await fs.appendFile(logFilePath, `\nCOUNTED OK: provider rate limit or quota, not a sandbox failure\n`)
  }
  return { name, verdict, durationMs: Date.now() - startedAt, failure: lastFailure.slice(0, 4000), rateLimited }
}

async function main() {
  const testTimestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logsDir = path.join(process.cwd(), LOGS_DIRECTORY, testTimestamp)
  await fs.mkdir(logsDir, { recursive: true })

  // Optional substring filters, so a single example can be run while iterating:
  //   npm test -- hello-world
  const filters = process.argv.slice(2)
  const selected = filters.length
    ? scripts.filter((s) => filters.some((f) => s.name.includes(f)))
    : scripts

  if (!selected.length) {
    console.error(`No examples matched ${filters.join(', ')}`)
    process.exitCode = 1
    return
  }

  // Templates first: several examples create sandboxes from a custom template
  // that has to exist on the account. Skipped when they already do.
  const neededTemplates = new Set(
    selected.map((s) => TEMPLATE_USED_BY[s.name]).filter(Boolean),
  )
  if (neededTemplates.size) {
    const failedBuilds = await buildTemplates(logsDir, neededTemplates)
    if (failedBuilds.length) {
      console.log(`\n${failedBuilds.length} template build(s) failed: ${failedBuilds.join(', ')}`)
    }
  }

  const queue = [...selected]
  const results: Outcome[] = []

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      results.push(await withProviderLock(next.provider, () => runOne(next, logsDir)))
    }
  })
  await Promise.all(workers)

  // Same shape updateTestsMd.js already consumes.
  const resultsPath = path.join(process.cwd(), 'tests', 'results.json')
  await fs.writeFile(
    resultsPath,
    JSON.stringify(
      {
        numTotalTests: results.length,
        numPassedTests: results.filter((r) => r.verdict === 'pass').length,
        numFailedTests: results.filter((r) => r.verdict === 'fail').length,
        numPendingTests: results.filter((r) => r.verdict === 'skip').length,
        testResults: [
          {
            assertionResults: results
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((r) => ({
                title: r.name,
                // Counted as OK, but recorded so the report can say which passes
                // were the provider refusing rather than the example working.
                rateLimited: Boolean(r.rateLimited),
                status: r.verdict === 'pass' ? 'passed' : r.verdict === 'skip' ? 'pending' : 'failed',
                duration: r.durationMs,
                failureMessages: r.verdict === 'pass' ? [] : [r.failure],
              })),
          },
        ],
      },
      null,
      2,
    ),
  )

  const failed = results.filter((r) => r.verdict === 'fail')
  const skipped = results.filter((r) => r.verdict === 'skip')
  const passed = results.filter((r) => r.verdict === 'pass')

  const rateLimited = passed.filter((r) => r.rateLimited)

  console.log(
    `\n${passed.length} passed, ${skipped.length} skipped, ${failed.length} failed (of ${results.length})` +
      (rateLimited.length ? ` - ${rateLimited.length} of the passes were rate limited or out of quota` : ''),
  )
  if (rateLimited.length) {
    console.log(`Rate limited (counted OK, the sandbox ran): ${rateLimited.map((r) => r.name).join(', ')}`)
  }
  if (skipped.length) {
    // Not failures: the sandbox did its job and the model did something else.
    console.log(`Skipped (model behaviour, not the sandbox): ${skipped.map((s) => s.name).join(', ')}`)
  }
  if (failed.length) {
    console.log(`Failed: ${failed.map((f) => f.name).join(', ')}`)
    console.log(`Per-example logs in ${LOGS_DIRECTORY}/`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('Runner crashed:', err)
  process.exitCode = 1
})
