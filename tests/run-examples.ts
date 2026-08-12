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
 * script. It still writes tests/results.json in the shape updateTestsMd.js
 * expects, so the reporting and Slack steps are unchanged.
 */
import { promises as fs } from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { Sandbox } from 'e2b'

import { uploadPathToPath, getApiKeys } from './utils'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

type Interpreter = 'npm' | 'poetry' | 'jupyter' | 'uv'

const scripts: { name: string; interpreter: Interpreter; file: string }[] = [
  { name: 'hello-world-js', interpreter: 'npm', file: './examples/hello-world-js/' },
  { name: 'claude-code-interpreter-js', interpreter: 'npm', file: './examples/claude-code-interpreter-js/' },
  { name: 'firecrawl-scrape-and-analyze-airbnb-data', interpreter: 'npm', file: './examples/firecrawl-scrape-and-analyze-airbnb-data/' },
  { name: 'together-ai-code-interpreter-js', interpreter: 'npm', file: './examples/together-ai-code-interpreter-js' },
  { name: 'fireworks-code-interpreter-python', interpreter: 'jupyter', file: './examples/fireworks-code-interpreter-python/qwen_code_interpreter.ipynb' },
  { name: 'groq-code-interpreter-python', interpreter: 'jupyter', file: './examples/groq-code-interpreter-python/llama_3_code_interpreter.ipynb' },
  { name: 'o1-code-interpreter-python', interpreter: 'jupyter', file: './examples/o1-and-gpt-4-python/o1.ipynb' },
  { name: 'codestral-code-interpreter-js', interpreter: 'npm', file: './examples/codestral-code-interpreter-js/' },
  { name: 'gpt-4o-code-interpreter-js', interpreter: 'npm', file: './examples/gpt-4o-js/' },
  { name: 'codestral-code-interpreter-python', interpreter: 'jupyter', file: './examples/codestral-code-interpreter-python/codestral_code_interpreter.ipynb' },
  { name: 'upload-dataset-code-interpreter', interpreter: 'jupyter', file: './examples/upload-dataset-code-interpreter/llama_3_code_interpreter_upload_dataset.ipynb' },
  { name: 'hello-world-python', interpreter: 'poetry', file: './examples/hello-world-python/' },
  { name: 'o1-code-interpreter-js', interpreter: 'npm', file: './examples/o1-and-gpt-4-js/' },
  { name: 'gpt-4o-code-interpreter', interpreter: 'jupyter', file: './examples/gpt-4o-python/gpt_4o.ipynb' },
  { name: 'together-ai-code-interpreter-python', interpreter: 'jupyter', file: './examples/together-ai-code-interpreter-python/together_with_e2b_code_interpreter.ipynb' },
  { name: 'langchain-python', interpreter: 'poetry', file: './examples/langchain-python/' },
  { name: 'langgraph-python', interpreter: 'poetry', file: './examples/langgraph-python/' },
  { name: 'groq-code-interpreter-js', interpreter: 'npm', file: './examples/groq-code-interpreter-js/' },
  { name: 'claude-code-interpreter-python', interpreter: 'jupyter', file: './examples/claude-code-interpreter-python/claude_code_interpreter.ipynb' },
  { name: 'claude-visualize-website-topics', interpreter: 'jupyter', file: './examples/claude-visualize-website-topics/claude-visualize-website-topics.ipynb' },
  { name: 'watsonx-ai-code-interpreter-python', interpreter: 'jupyter', file: './examples/watsonx-ai-code-interpreter-python/granite_code_interpreter_py.ipynb' },
  { name: 'mcp-client-js', interpreter: 'npm', file: './examples/mcp-client-js/' },
  { name: 'mcp-custom-server-js', interpreter: 'npm', file: './examples/mcp-custom-server-js/' },
  { name: 'mcp-research-agent-js', interpreter: 'npm', file: './examples/mcp-research-agent-js/' },
  { name: 'mcp-claude-code-js', interpreter: 'npm', file: './examples/mcp-claude-code-js/' },
  { name: 'mcp-browserbase-js', interpreter: 'npm', file: './examples/mcp-browserbase-js/' },
  { name: 'mcp-groq-exa-js', interpreter: 'npm', file: './examples/mcp-groq-exa-js/' },
  { name: 'openai-js', interpreter: 'npm', file: './examples/openai-js/' },
  { name: 'openai-python', interpreter: 'jupyter', file: './examples/openai-python/openai.ipynb' },
  { name: 'watsonx-ai-code-interpreter-js', interpreter: 'npm', file: './examples/watsonx-ai-code-interpreter-js/' },
  { name: 'custom-sandbox-domain-proxy', interpreter: 'npm', file: './examples/custom-sandbox-domain-proxy/' },
  { name: 'crewai-python', interpreter: 'uv', file: './examples/crewai-python/' },
  { name: 'stirrup-python', interpreter: 'uv', file: './examples/stirrup-python/' },
]

// Deliberately not covered, and why. Anything not listed here should be added above.
//
// Needs a custom E2B template built first, which this runner does not do:
//   anthropic-claude-code-in-sandbox-js, anthropic-claude-code-in-sandbox-python,
//   openai-codex-in-sandbox-js, openai-codex-in-sandbox-python, playwright-in-e2b,
//   mcp-custom-template-js (fails with "template 'browserbase-mcp-gateway' not found")
// Starts a long-running server and never exits, so it can only ever time out here:
//   agentkit-coding-agent
// Blocked upstream: the third-party `sandbox-agent` package (0.4.2, latest) calls
// Sandbox.betaCreate(), which the E2B SDK removed between 2.20 and 2.30. It cannot
// run against any current SDK, and was already failing on main for this reason:
//   sandbox-agent-sdk-js
// Multiple projects in one directory, which the one-project-per-dir runner cannot express:
//   anthropic-managed-agents (javascript/ + python/), docker-in-e2b (js/ + python/)
// No single entrypoint:
//   openai-agents-sdk (11 standalone scripts, no manifest)
// Needs its own toolchain (the `eve` CLI, Node >=24):
//   flue-feedback-analyst-js, vercel-eve-feedback-analyst-js
// No integration test for a Next.js app yet:
//   nextjs-code-interpreter

const SANDBOX_TEST_DIRECTORY = '/home/user/example'
const LOGS_DIRECTORY = 'logs'
const SANDBOX_TIMEOUT = 300_000
const COMMAND_TIMEOUT = 150_000
const MAX_ATTEMPTS = 3
const CONCURRENCY = 5

// A deterministic failure will fail identically on every retry, so only retry
// the transient ones. The old suite retried everything three times, which
// tripled sandbox time and provider spend on already-doomed runs.
function isRetryable(output: string): boolean {
  return /rate limit|429|50[023]|deadline_exceeded|ETIMEDOUT|ECONNRESET|temporarily unavailable/i.test(output)
}

function testScript(interpreter: Interpreter, notebookPath: string): string[] {
  const INSTALL_POETRY_COMMAND = 'curl -sSL https://install.python-poetry.org | python3 -'
  // Installed from PyPI rather than `curl | sh`: this sandbox is handed provider
  // API keys a moment later, so an unpinned remote script does not belong here.
  const INSTALL_UV_COMMAND = 'pip install --quiet uv'
  const SET_PATH_COMMAND = 'PATH=/home/user/.local/bin/:$PATH'

  // A uv / PEP-621 project. Entrypoint is main.py by convention.
  if (interpreter === 'uv') {
    return [INSTALL_UV_COMMAND, SET_PATH_COMMAND, `cd ${SANDBOX_TEST_DIRECTORY}`, 'uv sync', 'uv run main.py']
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
    return [INSTALL_POETRY_COMMAND, SET_PATH_COMMAND, `cd ${SANDBOX_TEST_DIRECTORY}`, 'poetry install', 'poetry run start']
  }

  // A NodeJS project.
  if (interpreter === 'npm') {
    return [`cd ${SANDBOX_TEST_DIRECTORY}`, 'npm install', 'npm run start']
  }

  return []
}

type Outcome = { name: string; passed: boolean; durationMs: number; failure: string }

async function runOne(
  { name, interpreter, file: examplePath }: (typeof scripts)[number],
  logsDir: string,
): Promise<Outcome> {
  const startedAt = Date.now()
  const logFilePath = path.join(logsDir, `${name}.txt`)
  let lastFailure = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const sandbox = await Sandbox.create({ timeoutMs: SANDBOX_TIMEOUT })
    let stderrData = ''

    try {
      await uploadPathToPath(examplePath, SANDBOX_TEST_DIRECTORY, sandbox)

      const notebookPath = path.posix.join(SANDBOX_TEST_DIRECTORY, path.basename(examplePath))
      const command = testScript(interpreter, notebookPath).join(' && ')

      await sandbox.commands.run(command, {
        onStderr: async (output) => {
          stderrData += output
          await fs.appendFile(logFilePath, output)
        },
        onStdout: async (output) => {
          await fs.appendFile(logFilePath, output)
        },
        envs: getApiKeys(),
        timeoutMs: COMMAND_TIMEOUT,
      })

      console.log(`PASS  ${name} (attempt ${attempt})`)
      await fs.appendFile(logFilePath, `\nPASS on attempt ${attempt}\n`)
      return { name, passed: true, durationMs: Date.now() - startedAt, failure: '' }
    } catch (error: any) {
      // commands.run throws CommandExitError on a non-zero exit, so this is the
      // path a failing example actually takes. Record enough to diagnose it.
      const detail = `${error?.message ?? error}\n${error?.result?.stderr ?? stderrData}`
      lastFailure = detail
      await fs.appendFile(logFilePath, `\nAttempt ${attempt}/${MAX_ATTEMPTS} failed:\n${detail}\n`)

      if (!isRetryable(detail)) {
        console.log(`FAIL  ${name} (attempt ${attempt}, not retryable)`)
        break
      }
      console.log(`RETRY ${name} (attempt ${attempt} hit a transient error)`)
      await new Promise((r) => setTimeout(r, 10_000))
    } finally {
      await sandbox.kill().catch(() => {})
    }
  }

  console.log(`FAIL  ${name}`)
  return { name, passed: false, durationMs: Date.now() - startedAt, failure: lastFailure.slice(0, 4000) }
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

  const queue = [...selected]
  const results: Outcome[] = []

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      results.push(await runOne(next, logsDir))
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
        numPassedTests: results.filter((r) => r.passed).length,
        numFailedTests: results.filter((r) => !r.passed).length,
        testResults: [
          {
            assertionResults: results
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((r) => ({
                title: r.name,
                status: r.passed ? 'passed' : 'failed',
                duration: r.durationMs,
                failureMessages: r.passed ? [] : [r.failure],
              })),
          },
        ],
      },
      null,
      2,
    ),
  )

  const failed = results.filter((r) => !r.passed)
  console.log(`\n${results.length - failed.length}/${results.length} examples passed`)
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
