/**
 * E2B sandbox mode CLI.
 *
 *   node --env-file=.env --experimental-transform-types scripts/synthesize-e2b.ts "<message>"
 *
 * Creates the E2B sandbox and stages the feedback corpus into it, then hands
 * everything to the agent: the analysis happens in the sandbox, the agent
 * writes an HTML report there and publishes it (publish_report starts a
 * static server on port 8000 inside the sandbox). The reply — a couple of
 * sentences plus the public report URL — goes to stdout.
 *
 * On success the sandbox is left RUNNING so the URL stays clickable; it
 * self-destructs when its timeout lapses. On failure it is killed.
 */
import { init } from '@flue/runtime';
import { start } from '@flue/runtime/node';
import { createE2bSynthesizer } from '../src/agents/product-feedback-synthesizer-e2b.ts';
import { logToolActivity } from '../src/repl/repl.ts';
import { createStagedSandbox, SANDBOX_TTL_MS } from '../src/shared/stage-sandbox.ts';

const message = process.argv.slice(2).join(' ').trim();
if (!message) {
	console.error(
		'usage: node --env-file=.env --experimental-transform-types scripts/synthesize-e2b.ts "<message>"',
	);
	process.exit(2);
}

// The tool trace on stderr is the point of the run: which tools the agent chose,
// in what order. stdout stays the reply alone, so piping still works.
logToolActivity();

// Sandbox, corpus at ~/data/, and the pandas/matplotlib toolchain run_analysis needs.
const sandbox = await createStagedSandbox();

try {
	const Synthesizer = createE2bSynthesizer(async () => sandbox);

	// In-memory runtime: one conversation, gone when the process exits.
	// (`await using` needs Node 24; stop() in finally keeps Node 22 happy.)
	const flue = await start({ agents: [Synthesizer] });
	try {
		const agent = init(Synthesizer, { id: `synthesis-${sandbox.sandboxId}` });
		const receipt = await agent.dispatch(message);
		const reply = await agent.read(receipt);
		console.log(reply.text);
	} finally {
		await flue.stop();
	}

	const reportUrl = `https://${sandbox.getHost(8000)}`;
	console.error(`[e2b] report: ${reportUrl}`);
	console.error(
		`[e2b] sandbox ${sandbox.sandboxId} stays up for ~${SANDBOX_TTL_MS / 60_000} min, then self-destructs`,
	);
} catch (error) {
	await sandbox.kill();
	console.error(`[e2b] run failed — sandbox killed: ${sandbox.sandboxId}`);
	throw error;
}
