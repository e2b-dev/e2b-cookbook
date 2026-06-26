// Driver (runs locally): provisions an E2B sandbox, uploads the agent, installs
// the AI SDK inside it, and runs the agent loop IN the sandbox. The agent drives
// a remote Browserbase browser over CDP — so the browser never runs in the
// sandbox itself. The `browse` CLI is already baked into the template image.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Sandbox } from 'e2b';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEMPLATE = 'browsecli-sandbox'; // matches template_name in e2b.toml

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
const ANTHROPIC_API_KEY = req('ANTHROPIC_API_KEY');
const BROWSERBASE_API_KEY = req('BROWSERBASE_API_KEY');
const { TASK } = process.env;

console.log(`› Creating E2B sandbox from template "${TEMPLATE}"…`);
const sandbox = await Sandbox.create({
  template: TEMPLATE,
  timeoutMs: 600_000, // 10 min — plenty for the agent loop + remote page loads
});
console.log(`› Sandbox ready: ${sandbox.sandboxId}`);

try {
  // 1) Upload the agent into the sandbox.
  await sandbox.files.write('/home/user/agent.mjs', readFileSync(join(__dirname, 'agent.mjs'), 'utf8'));
  await sandbox.files.write('/home/user/package.json', '{"name":"browse-agent","type":"module","private":true}');

  // 2) Install the AI SDK inside the sandbox. (`browse` is already baked into
  //    the template image — see e2b.Dockerfile.)
  console.log('› Installing the AI SDK inside the sandbox…');
  const install = await sandbox.commands.run('bash -lc "cd /home/user && npm i ai @ai-sdk/anthropic zod"', {
    timeoutMs: 300_000,
    onStdout: (d: string) => process.stdout.write(d),
    onStderr: (d: string) => process.stderr.write(d),
  });
  if (install.exitCode !== 0) throw new Error(`install failed (exit ${install.exitCode})`);

  // 3) Run the agent loop IN the sandbox; stream its output. Keys are injected as env.
  console.log('› Running the browser agent inside the sandbox…\n');
  const run = await sandbox.commands.run('bash -lc "cd /home/user && node agent.mjs"', {
    envs: { ANTHROPIC_API_KEY, BROWSERBASE_API_KEY, ...(TASK ? { TASK } : {}) },
    timeoutMs: 600_000,
    onStdout: (d: string) => process.stdout.write(d),
    onStderr: (d: string) => process.stderr.write(d),
  });
  process.exitCode = run.exitCode ?? 0;
} finally {
  await sandbox.kill();
}
