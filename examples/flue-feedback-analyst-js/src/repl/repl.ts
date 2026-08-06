/**
 * Minimal terminal REPL for driving a Flue agent.
 *
 * Owns the terminal concerns only — prompt loop, multi-line paste, live tool
 * activity log, exit/Ctrl+C/EOF handling. What a message does and what
 * cleanup means are the caller's (see scripts/dev.ts).
 */
import { createInterface, type Interface } from 'node:readline/promises';
import { observe } from '@flue/runtime';

/** One-line summary of a tool call's arguments for the activity log. */
function summarizeArgs(toolName: string, args: unknown): string {
	if (!args || typeof args !== 'object') return '';
	const a = args as Record<string, unknown>;
	const pick =
		toolName === 'bash'
			? a.command
			: (a.command ??
				// run_analysis names its own question; the script itself is noise here.
				a.purpose ??
				a.file_path ??
				a.path ??
				a.headline ??
				a.title ??
				a.pattern ??
				JSON.stringify(a));
	return typeof pick === 'string' ? pick.replaceAll('\n', ' ').slice(0, 90) : '';
}

/** Eve-style live activity log: every tool call the agent makes, as it happens. */
export function logToolActivity(): void {
	observe((event) => {
		if (event.type === 'tool_start') {
			console.error(`  ▪ ${event.toolName}  ${summarizeArgs(event.toolName, event.args)}`);
		} else if (event.type === 'tool') {
			const secs = (event.durationMs / 1000).toFixed(1);
			console.error(`    → ${event.isError ? 'ERROR' : 'ok'} (${secs}s)`);
		}
	});
}

/**
 * Read one message. A multi-line paste lands in readline's buffer at once, so
 * after the first line keep draining with a 200ms abortable question; typed
 * single-line input just times out immediately into a submit.
 */
async function readMessage(rl: Interface): Promise<string> {
	const first = await rl.question('\nyou › ');
	const lines = [first];
	for (;;) {
		const abort = new AbortController();
		const timer = setTimeout(() => abort.abort(), 200);
		try {
			lines.push(await rl.question('', { signal: abort.signal }));
		} catch {
			break;
		} finally {
			clearTimeout(timer);
		}
	}
	return lines.join('\n').trim();
}

export interface ReplOptions {
	banner?: string;
	/** Handle one user message; the returned text is printed as the reply. */
	onMessage: (message: string) => Promise<string>;
	/** Cleanup on exit/quit/Ctrl+C/EOF. Runs exactly once. */
	onExit: () => Promise<void>;
}

export async function runRepl({ banner, onMessage, onExit }: ReplOptions): Promise<never> {
	// Created only now — at call time, after the caller's boot — so a prompt
	// pasted early isn't consumed by a listenerless interface and lost.
	const rl = createInterface({ input: process.stdin, output: process.stderr });

	let closing = false;
	async function shutdown(): Promise<never> {
		if (!closing) {
			closing = true;
			rl.close();
			await onExit();
		}
		process.exit(0);
	}

	rl.on('SIGINT', () => void shutdown());
	// EOF (piped stdin, Ctrl+D) closes the interface underneath us.
	rl.on('close', () => {
		if (!closing) void shutdown();
	});

	if (banner) console.error(banner);

	for (;;) {
		let message: string;
		try {
			message = await readMessage(rl);
		} catch {
			return shutdown(); // interface closed mid-read
		}
		if (!message) continue;
		if (message === 'exit' || message === 'quit') return shutdown();

		const startedAt = Date.now();
		try {
			const reply = await onMessage(message);
			console.error(`… done in ${Math.round((Date.now() - startedAt) / 1000)}s`);
			console.log(`\n${reply}`);
		} catch (error) {
			console.error(`[repl] turn failed: ${error instanceof Error ? error.message : error}`);
		}
	}
}
