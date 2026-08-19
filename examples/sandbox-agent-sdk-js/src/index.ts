import 'dotenv/config';
import { SandboxAgent } from 'sandbox-agent';
import { e2b } from 'sandbox-agent/e2b';

async function main() {
	const envs: Record<string, string> = {};
	if (process.env.ANTHROPIC_API_KEY) envs.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
	if (process.env.OPENAI_API_KEY) envs.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
	if (process.env.CODEX_API_KEY) envs.CODEX_API_KEY = process.env.CODEX_API_KEY;
	if (!envs.CODEX_API_KEY && envs.OPENAI_API_KEY) envs.CODEX_API_KEY = envs.OPENAI_API_KEY;
	if (!envs.OPENAI_API_KEY && !envs.CODEX_API_KEY && !envs.ANTHROPIC_API_KEY) {
		throw new Error('Set OPENAI_API_KEY/CODEX_API_KEY or ANTHROPIC_API_KEY');
	}

	console.log('Starting Sandbox Agent');
	const sdk = await SandboxAgent.start({
		sandbox: e2b({
			create: { envs },
		})
	});
	console.log(`Ready. Visit Sandbox Agent inspector URL: ${sdk.inspectorUrl}`);

	// Uncomment to run one prompt and stream events in your terminal.
	// Read more about Sessions and Events here: https://sandboxagent.dev/docs/agent-sessions
	// const session = await sdk.createSession({ agent: "claude" });
	// const off = session.onEvent((event) => {
	// 	 console.log(`[event] from ${event.sender}`, event.payload);
	// })
	// await session.prompt([{ type: 'text', text: 'Reply with exactly: sandbox-agent-ready' }])
	// off()

	process.on("SIGINT", async () => {
		console.log("Destroying sandbox");
		await sdk.destroySandbox();
		process.exit();
	});
}

main();