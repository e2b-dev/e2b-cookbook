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

const system = `You are an autonomous deep-research agent. You have a \`browse\` CLI (Browserbase browser automation) in your bash tool — it is installed, and its auth and a shared browser session are already configured via environment variables. Learn how to use it by running \`browse --help\` (and \`browse <command> --help\` as needed), then complete the task. When you cite a document, link the direct document itself, not a viewer, preview, or index page that wraps it. Return a clear, well-sourced answer.`;

console.log(`› Creating E2B sandbox from template "${TEMPLATE}"…`);
const sandbox = await Sandbox.create(TEMPLATE, {
  timeoutMs: 600_000, // 10 min — plenty for the agent loop + remote page loads
  // Inject the Browserbase key into the sandbox so `browse` can authenticate.
  // It lives only in the sandbox env, never on disk or in this repo.
  // BROWSE_SESSION steers every `browse` call to the same remote session, so the
  // agent gets a shared cloud browser with no `--remote`/`--session` flags.
  envs: { BROWSERBASE_API_KEY, BROWSE_SESSION: SESSION },
});
console.log(`› Sandbox ready: ${sandbox.sandboxId}`);

try {
  console.log('› Running the deep-research agent (host loop, sandbox tool)…\n');
  const result = await generateText({
    model: anthropic('claude-sonnet-5'),
    stopWhen: stepCountIs(40),
    system,
    prompt: TASK,
    tools: {
      bash: tool({
        description: 'Run a bash command in the sandbox and return its output.',
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
