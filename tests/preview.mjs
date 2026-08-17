/**
 * Write a synthetic tests/results.json so the Slack message can be previewed
 * without running 31 examples against live E2B and four paid providers.
 *
 *   node tests/preview.mjs ok       - a healthy run, some passes rate limited
 *   node tests/preview.mjs failure  - failures, a skip and a rate limit together
 *
 * report.mjs then turns it into the same payload a real run would produce, so what
 * you see in Slack is what a real run of that shape looks like. Iterating on the
 * Workflow Builder template against a 15-minute run is otherwise the slow way to
 * find out a variable name is wrong.
 */
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const scenario = process.argv[2]
if (!['ok', 'failure'].includes(scenario)) {
  console.error(`Usage: node tests/preview.mjs ok|failure  (got ${scenario ?? 'nothing'})`)
  process.exit(1)
}

const ok = (title, rateLimited = false) => ({ title, status: 'passed', rateLimited })
const skip = (title) => ({ title, status: 'pending', rateLimited: false })
const fail = (title) => ({ title, status: 'failed', rateLimited: false })

// Shapes taken from real runs on this branch rather than invented, so the preview
// exercises the same name lengths and counts Slack will actually have to render.
const SCENARIOS = {
  ok: [
    ...['hello-world-js', 'hello-world-python', 'claude-code-interpreter-js',
        'claude-code-interpreter-python', 'claude-visualize-website-topics',
        'codestral-code-interpreter-js', 'codestral-code-interpreter-python',
        'firecrawl-scrape-and-analyze-airbnb-data', 'groq-code-interpreter-python',
        'mcp-client-js', 'mcp-claude-code-js', 'mcp-custom-server-js',
        'mcp-custom-template-js', 'mcp-groq-exa-js', 'playwright-in-e2b',
        'docker-in-e2b-js', 'docker-in-e2b-python', 'custom-sandbox-domain-proxy',
        'anthropic-claude-code-in-sandbox-js', 'anthropic-claude-code-in-sandbox-python',
        'together-ai-code-interpreter-js', 'together-ai-code-interpreter-python',
       ].map((t) => ok(t)),
    ...['openai-js', 'openai-python', 'gpt-4o-code-interpreter',
        'gpt-4o-code-interpreter-js', 'o1-code-interpreter-js',
        'o1-code-interpreter-python', 'langchain-python', 'langgraph-python',
        'crewai-python',
       ].map((t) => ok(t, true)),
  ],
  failure: [
    fail('openai-js'),
    fail('playwright-in-e2b'),
    fail('docker-in-e2b-python'),
    skip('claude-visualize-website-topics'),
    ok('langchain-python', true),
    ok('crewai-python', true),
    ...['hello-world-js', 'hello-world-python', 'claude-code-interpreter-js',
        'mcp-client-js', 'mcp-groq-exa-js', 'groq-code-interpreter-python',
        'codestral-code-interpreter-js', 'together-ai-code-interpreter-js',
       ].map((t) => ok(t)),
  ],
}

const assertionResults = SCENARIOS[scenario]
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results.json')
await fs.writeFile(
  out,
  JSON.stringify(
    {
      numTotalTests: assertionResults.length,
      numPassedTests: assertionResults.filter((a) => a.status === 'passed').length,
      numFailedTests: assertionResults.filter((a) => a.status === 'failed').length,
      numPendingTests: assertionResults.filter((a) => a.status === 'pending').length,
      testResults: [{ assertionResults }],
    },
    null,
    2,
  ),
)
console.log(`preview: wrote a synthetic "${scenario}" results.json (${assertionResults.length} examples)`)
