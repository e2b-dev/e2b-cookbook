import { defineTool } from '@flue/runtime';
import type { Sandbox as E2BSandbox } from 'e2b';
import * as v from 'valibot';

/**
 * Serves a report the agent has already written to disk inside the E2B
 * sandbox and hands back a public URL (ported from the Eve variant's
 * publish_report). It deliberately takes no HTML: the agent writes the file
 * in the sandbox, so report bytes never travel through the model's context —
 * this tool only starts a static server and resolves the address.
 *
 * The sandbox object lives in the calling script, so the tool is a factory
 * closing over it — unlike Eve, no metadata lookup is needed to reach
 * `getHost()`.
 */

/** Everything under here is served. The agent writes its report into it. */
export const REPORT_DIR = '/home/user/report';
const PORT = 8000;
const BIND_TIMEOUT_MS = 10_000;

// Always exits 0 — e2b's commands.run throws CommandExitError on a non-zero
// exit, so the up/down answer travels via stdout instead.
const PROBE = `python3 -c "import socket; print('UP' if socket.socket().connect_ex(('127.0.0.1',${PORT}))==0 else 'DOWN')"`;

async function serverIsUp(sandbox: E2BSandbox) {
	const probe = await sandbox.commands.run(PROBE);
	return probe.stdout.trim() === 'UP';
}

export function publishReport(getSandbox: () => Promise<E2BSandbox>) {
	return defineTool({
		name: 'publish_report',
		description: [
			`Publish a finished HTML report from the sandbox and return a public URL the user can open.`,
			'',
			`Write the report to ${REPORT_DIR}/index.html FIRST, then call this. Requirements:`,
			'- one self-contained page: inline the CSS; charts as inline SVG, or base64 <img> if you use matplotlib',
			'- anything else you drop in that folder (PNG, CSV) is served too, so the user can download it',
			'',
			'Starting the server is idempotent — calling this twice reuses the running one.',
		].join('\n'),
		input: v.object({
			headline: v.pipe(
				v.string(),
				v.minLength(10),
				v.description('One line naming what the report shows. Shown to the user beside the link.'),
			),
		}),
		async run({ data }) {
			const sandbox = await getSandbox();

			const entry = `${REPORT_DIR}/index.html`;
			if (!(await sandbox.files.exists(entry))) {
				return `Nothing at ${entry}. Write the report there first, then call this again.`;
			}

			if (!(await serverIsUp(sandbox))) {
				await sandbox.commands.run(`python3 -m http.server ${PORT} --directory ${REPORT_DIR}`, {
					background: true,
					timeoutMs: 0,
				});
				const deadline = Date.now() + BIND_TIMEOUT_MS;
				while (!(await serverIsUp(sandbox))) {
					if (Date.now() > deadline) {
						return 'The report server did not start. Check the report directory, then retry.';
					}
					await new Promise((resolve) => setTimeout(resolve, 250));
				}
			}

			const url = `https://${sandbox.getHost(PORT)}`;
			return {
				output: [
					`Published: ${url}`,
					'',
					'Give the user this URL as a link and stop. Do not restate the report contents —',
					`one or two sentences on "${data.headline}" plus the link is the whole reply.`,
				].join('\n'),
			};
		},
	});
}
