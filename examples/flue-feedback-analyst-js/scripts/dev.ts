/**
 * Interactive dev session for the E2B sandbox mode.
 *
 *   pnpm dev   (→ node --env-file=.env --experimental-transform-types scripts/dev.ts)
 *
 * Boots one sandbox + one Flue conversation for the whole session: paste a
 * prompt, the agent analyzes the staged corpus inside the sandbox, publishes
 * the HTML report, and replies with the public URL. Follow-ups continue the
 * same conversation. `exit`, `quit`, or Ctrl+C kills the sandbox and leaves.
 *
 * Terminal mechanics live in src/repl/repl.ts; this script is only the wiring:
 * sandbox lifecycle, corpus staging, and the Flue runtime.
 */
import { init } from '@flue/runtime';
import { start } from '@flue/runtime/node';
import { createE2bSynthesizer } from '../src/agents/product-feedback-synthesizer-e2b.ts';
import { logToolActivity, runRepl } from '../src/repl/repl.ts';
import { createStagedSandbox, SANDBOX_TTL_MS } from '../src/shared/stage-sandbox.ts';

logToolActivity();

// Sandbox, corpus at ~/data/, and the pandas/matplotlib toolchain run_analysis needs.
const sandbox = await createStagedSandbox();

const Synthesizer = createE2bSynthesizer(async () => sandbox);
const flue = await start({ agents: [Synthesizer] });
const agent = init(Synthesizer, { id: `repl-${sandbox.sandboxId}` });

await runRepl({
	banner: '[repl] paste a prompt and press Enter — "exit" or Ctrl+C to quit',

	async onMessage(message) {
		const receipt = await agent.dispatch(message);
		const reply = await agent.read(receipt);
		// Keep the sandbox (and any published report URL) alive while the session is.
		await sandbox.setTimeout(SANDBOX_TTL_MS);
		return reply.text;
	},

	async onExit() {
		// Sandbox first — it's the cleanup that costs money if skipped.
		// flue.stop() gets a bounded wait so a wedged drain can't block exit.
		await sandbox.kill();
		console.error(`\n[e2b] sandbox killed: ${sandbox.sandboxId}`);
		await Promise.race([flue.stop(), new Promise((resolve) => setTimeout(resolve, 5_000))]);
	},
});
