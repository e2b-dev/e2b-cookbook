// A deep-research agent that runs on the HOST and uses an E2B sandbox as its
// tool surface. The agent (Vercel AI SDK) has a single `bash` tool; every
// command it writes is executed INSIDE an E2B sandbox via sandbox.commands.run.
//
// The sandbox image ("browsecli-sandbox") has the Browserbase `browse` CLI
// installed, so the agent does its research by running `browse` commands in the
// sandbox. `browse` drives a browser that runs REMOTELY on Browserbase (over
// CDP) — no Chrome runs in the sandbox itself.
//
//   host (this file)                E2B sandbox                Browserbase
//   AI SDK agent loop  ── bash ──▶  browse CLI   ── CDP/wss ──▶  remote browser
//
import 'dotenv/config';
import { Sandbox } from 'e2b';
import { generateText, tool, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const TEMPLATE = 'browsecli-sandbox'; // matches template_name in e2b.toml
const SESSION = 'agent'; // a stable browse session so navigation persists across calls

const req = (n: string): string => {
  const v = process.env[n];
  if (!v) {
    console.error(`Missing required env var: ${n}`);
    process.exit(1);
  }
  return v;
};

// E2B_API_KEY is read from the environment by the E2B SDK automatically.
req('E2B_API_KEY');
req('ANTHROPIC_API_KEY'); // read by @ai-sdk/anthropic on the host
const BROWSERBASE_API_KEY = req('BROWSERBASE_API_KEY');

const TASK =
  process.env.TASK ||
  "For Snowflake, Datadog, and MongoDB, find each company's most recent 10-Q filing on SEC EDGAR (start at https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany). Confirm you have identified the single most recent 10-Q before reporting. Open the actual primary filing document (its .htm URL) — not the filing index, a viewer/preview page, or an exhibit — and extract the filing date and the fiscal period the report covers. Also report each company's most recent 10-K filing date. Return a comparison table across all three companies and cite each filing's direct document URL.";

const system = `You are an autonomous deep-research agent. You answer questions by investigating the live web with a real browser that runs remotely on Browserbase.

Your only tool is \`bash\`: it runs a shell command inside a sandbox that has the Browserbase \`browse\` CLI installed. Drive the browser by running \`browse\` commands. Useful commands:
  browse open '<url>' --remote --session ${SESSION}   # navigate (ALWAYS pass --remote so it uses the cloud browser, and --session ${SESSION} so pages persist across calls)
  browse get markdown body --session ${SESSION}        # read the current page as markdown (keeps links/URLs)
  browse get text body --session ${SESSION}            # read the current page as plain text
  browse --help                                        # discover more commands
Always single-quote URLs (many contain shell metacharacters like & that the shell would otherwise interpret).

Plan your own research: break the question into sub-questions, find and open relevant sources, follow links, and read pages to gather evidence. Use several independent sources and cross-check key facts. If a command errors or a page looks empty, try a different source instead of retrying it unchanged.

To stay effective:
- Pages are fully rendered (JavaScript runs) before you read them — the text/markdown you get back IS the real content. Read it carefully and extract what you need; don't assume a page "needs JavaScript" or abandon a source that already has the answer.
- Read each page once. Don't fetch the same page twice or as both markdown and text (for long pages "get text body" is best), and don't chase detours when a page you already have answers the question.
- Your steps are limited: once you have what you need for one item, move on, and leave yourself a step to write the final answer.

Reporting rules:
- When you report a document's URL, give the direct link to the document itself, not a viewer, preview, or rendering page.
- Before you call something the "most recent" item, actually verify it is the single newest one. List ordering is not guaranteed: read every candidate's own date, compare those dates, and pick the maximum — do not assume the first/top entry is newest. If any candidate has a more recent date than the one you picked, switch to it. Open and confirm the date on the item itself, not just a summary list.
When you can answer thoroughly, stop and return a concise, well-sourced synthesis that cites the URLs you used.`;

console.log(`› Creating E2B sandbox from template "${TEMPLATE}"…`);
const sandbox = await Sandbox.create(TEMPLATE, {
  timeoutMs: 600_000, // 10 min — plenty for the agent loop + remote page loads
  // Inject the Browserbase key into the sandbox so `browse` can authenticate.
  // It lives only in the sandbox env, never on disk or in this repo.
  envs: { BROWSERBASE_API_KEY },
});
console.log(`› Sandbox ready: ${sandbox.sandboxId}`);

try {
  console.log('› Running the deep-research agent (host loop, sandbox tool)…\n');
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    stopWhen: stepCountIs(40),
    system,
    prompt: TASK,
    tools: {
      bash: tool({
        description:
          'Run a shell command inside the E2B sandbox and return its output. The sandbox has the `browse` CLI installed; use it to drive a remote Browserbase browser (e.g. `browse open \'https://example.com\' --remote --session agent`).',
        inputSchema: z.object({ command: z.string().describe('The shell command to run.') }),
        execute: async ({ command }) => {
          process.stdout.write(`-> ${command}\n`);
          const r = await sandbox.commands.run(command, { timeoutMs: 60_000 }).catch((e) => ({
            stdout: '',
            stderr: String((e as Error)?.message ?? e),
            exitCode: 1,
          }));
          const out = (r.stdout || r.stderr || '').trim();
          process.stdout.write(`   <- exit ${r.exitCode}, ${out.length} chars\n`);
          return (r.exitCode === 0 ? out : `ERROR (exit ${r.exitCode}): ${out}`).slice(0, 40_000);
        },
      }),
    },
  });

  console.log('\n===== FINAL ANSWER =====\n' + (result.text || '(empty)') + `\n\n(steps: ${result.steps.length})`);
  await sandbox.commands.run(`browse stop --session ${SESSION}`).catch(() => {});
} finally {
  await sandbox.kill();
}
