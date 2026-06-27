// Runs INSIDE the sandbox. A Vercel AI SDK agent whose ONLY tool is the `browse`
// CLI; the browser runs remotely on Browserbase. No custom browser tool needed —
// the agent just shells out `browse <args>`.
import { generateText, tool, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { execSync } from 'node:child_process';
import { z } from 'zod';

const SESSION = 'agent';
const TASK = process.env.TASK ||
  "Using SEC EDGAR (start at https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany), research the recent SEC filing activity of Snowflake, Datadog, and MongoDB. For each company find its most recent 10-Q — the filing date, the fiscal period it covers, and the URL of the primary filing document — plus the date of its most recent 10-K. Return a comparison table across all three companies, citing the EDGAR pages you used.";

// Split the model's free-form arg string into tokens (respecting simple quotes),
// then re-quote each one for the shell. Without this, a URL containing shell
// metacharacters like `&` (common in query strings — e.g. SEC EDGAR links) would
// be split by the shell and break the command.
const splitArgs = (s) => (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^(["'])([\s\S]*)\1$/, '$2'));
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

const run = (args) => {
  const cmd = `browse ${splitArgs(args).map(shq).join(' ')} --session ${SESSION}`;
  try {
    return execSync(cmd, {
      encoding: 'utf8', timeout: 45000, killSignal: 'SIGKILL',
      env: process.env, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) { return `ERROR: ${(e.stdout || '') + (e.stderr || e.message || '')}`.slice(0, 400); }
};

const system = `You are an autonomous deep-research agent. You answer questions by investigating the live web with a real browser that runs remotely on Browserbase. Each tool call runs: browse <your args> (every call is automatically scoped to one shared session "${SESSION}").
Useful commands:
  open <url> --remote   # navigate (ALWAYS include --remote so it uses the cloud browser)
  get markdown body     # read the current page as markdown (keeps links/URLs)
  get text body         # read the current page as plain text
Use "--help" to discover more commands.

Plan your own research: break the question into sub-questions, find and open relevant sources, follow links, and read pages to gather evidence. Use several independent sources and cross-check key facts. If a page returns ERROR or looks empty, try a different source instead of retrying it unchanged. When you can answer thoroughly, stop browsing and return a concise, well-sourced synthesis that cites the URLs you used.

To stay effective:
- Pages are fully rendered (JavaScript runs) before you read them — the text/markdown you get back IS the real content. Read it carefully and extract what you need; don't assume a page "needs JavaScript" or abandon a source that already has the answer.
- Read each page once. Don't fetch the same page twice or as both markdown and text (for long pages "get text body" is best), and don't chase detours when a page you already have answers the question.
- Your steps are limited: once you have what you need for one item, move on, and leave yourself a step to write the final answer.`;

const result = await generateText({
  model: anthropic('claude-sonnet-4-5'),
  stopWhen: stepCountIs(40),
  system,
  prompt: TASK,
  tools: {
    browse: tool({
      description: 'Run a browse CLI command (omit leading "browse"). e.g. open https://example.com --remote ; get markdown body ; get text body',
      inputSchema: z.object({ args: z.string() }),
      execute: async ({ args }) => {
        process.stdout.write(`-> browse ${args}\n`);
        const out = run(args);
        process.stdout.write(`   <- ${out.length} chars${out.startsWith('ERROR') ? ' [ERR]' : ''}\n`);
        return out.slice(0, 40000);
      },
    }),
  },
});

console.log('\n===== FINAL ANSWER =====\n' + (result.text || '(empty)') + `\n\n(steps: ${result.steps.length})`);
run('stop');
