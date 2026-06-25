/**
 * BrowseCLI in an E2B sandbox — TypeScript runner.
 *
 * Spins up the `browsecli-sandbox` E2B template, uploads the demo script, and
 * runs it. The script uses the `browse` CLI (already baked into the template)
 * to drive a *remote* Verified Browserbase browser over CDP — residential IP,
 * stealth fingerprint, server-side CAPTCHA solving — and reach a Cloudflare-
 * protected page that a vanilla datacenter-IP sandbox browser would be blocked
 * from.
 *
 * The agent loop runs IN the sandbox; the browser runs ON Browserbase.
 *
 * Run:
 *   npm install
 *   npm run build:template   # one-time: e2b template build  (creates the image)
 *   npm start                # runs this file
 *
 * Required env (see env.template):
 *   E2B_API_KEY, BROWSERBASE_API_KEY
 *   Optional: TARGET_URL (default https://nowsecure.nl)
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Sandbox } from 'e2b';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEMPLATE = 'browsecli-sandbox'; // matches template_name in e2b.toml
const TARGET_URL = process.env.TARGET_URL ?? 'https://nowsecure.nl';

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function main() {
  // E2B_API_KEY is read from the environment by the SDK automatically.
  reqEnv('E2B_API_KEY');
  const browserbaseApiKey = reqEnv('BROWSERBASE_API_KEY');

  console.log(`Creating E2B sandbox from template "${TEMPLATE}"...`);
  const sbx = await Sandbox.create({
    template: TEMPLATE,
    timeoutMs: 600_000, // 10 min — plenty for a Verified session + page load
  });

  try {
    console.log(`Sandbox ready: ${sbx.sandboxId}`);

    // Upload the demo script into the sandbox and make it executable.
    const demo = readFileSync(join(__dirname, 'browsecli-demo.sh'), 'utf8');
    await sbx.files.write('/home/user/browsecli-demo.sh', demo);
    await sbx.commands.run('chmod +x /home/user/browsecli-demo.sh');

    console.log(`Running BrowseCLI demo against ${TARGET_URL} ...\n`);
    // Browserbase creds are passed as per-command env (E2B secrets work too).
    const result = await sbx.commands.run('/home/user/browsecli-demo.sh', {
      envs: {
        BROWSERBASE_API_KEY: browserbaseApiKey,
        TARGET_URL,
      },
      onStdout: (d: string) => {
        process.stdout.write(d);
      },
      onStderr: (d: string) => {
        process.stderr.write(d);
      },
      timeoutMs: 300_000,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Demo failed (exit ${result.exitCode}).`);
    }
    console.log('\n✅ Done — reached real content through a Verified Browserbase browser from inside E2B.');
  } finally {
    await sbx.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
