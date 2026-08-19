import { randomBytes } from 'node:crypto';
import { defineTool } from '@flue/runtime';
import { CommandExitError } from 'e2b';
import type { Sandbox as E2BSandbox } from 'e2b';
import * as v from 'valibot';
import { REPORT_DIR } from './publish-report.ts';

/**
 * The escape hatch from the fixed tools (port of the Eve variant's
 * `run_analysis`). `search_feedback` and `feedback_stats` answer the questions
 * they were shaped for; this answers the ones they were not — cross-tabs,
 * cohort splits, repeat-writer detection, lining a feedback series up against a
 * trend week by week.
 *
 * The script runs in the agent's E2B sandbox against the same two exports the
 * other tools read, staged at `~/data/`. A non-zero exit is a normal result,
 * not an error: the traceback comes back so the model can fix its own script
 * rather than guessing at a number. That is why every failure path here
 * returns text instead of throwing — a throw would reach the model as a tool
 * error with none of the coaching.
 *
 * Like `publish_report`, this is a factory closing over the caller-owned
 * sandbox rather than a bare tool.
 */

const WORKDIR = '/home/user';
const SCRIPT_DIR = `${WORKDIR}/analysis`;

/** Wall-clock ceiling per script, enforced by `timeout(1)` inside the sandbox. */
const TIMEOUT_SECONDS = 120;

/** Keep a runaway `print` loop from swallowing the context window. */
const MAX_STREAM_CHARS = 12_000;

function truncate(stream: string): { text: string; truncated: boolean } {
	const text = stream.trim();
	if (text.length <= MAX_STREAM_CHARS) return { text, truncated: false };
	return { text: `${text.slice(0, MAX_STREAM_CHARS)}\n…[truncated]`, truncated: true };
}

export function runAnalysis(getSandbox: () => Promise<E2BSandbox>) {
	return defineTool({
		name: 'run_analysis',
		description: [
			'Run a Python script in the sandbox over the raw feedback and analytics exports.',
			'Use this for any question the fixed tools cannot express: cross-tabs, cohort splits,',
			'repeat-writer detection, correlating a feedback series against a weekly trend.',
			'Also use it to write the HTML report and its chart files.',
			'',
			`Environment: Python 3 with pandas and matplotlib (Agg backend), cwd ${WORKDIR}.`,
			'Data files, the same exports the fixed tools read:',
			'- data/dashboard-feedback-export.json — { export: {...}, responses: [...] }',
			'- data/product-analytics-export.json — { export: {...}, funnels, trends, service_health, annotations }',
			`Anything written to ${REPORT_DIR}/ is served by publish_report, so save charts as`,
			'.png and tables as .csv there for the reader to download.',
			'',
			'Only stdout comes back, so print what you need. Print counts of responses AND',
			"distinct orgs whenever you size something. Read the file's own `export` block",
			'for caveats and known gaps before trusting a number you compute from it.',
			'',
			'Prefer this over raw bash: it names the purpose, keeps the script on disk, and',
			'returns a fixable traceback instead of a hung turn.',
		].join('\n'),
		input: v.object({
			purpose: v.pipe(
				v.string(),
				v.minLength(10),
				v.description('The question this script answers, in one line. Shown to the user as the label.'),
			),
			script: v.pipe(
				v.string(),
				v.minLength(1),
				v.description(`Python source. Runs from ${WORKDIR}; print results to stdout.`),
			),
		}),
		async run({ data }) {
			const sandbox = await getSandbox();
			const path = `${SCRIPT_DIR}/${randomBytes(4).toString('hex')}.py`;

			await sandbox.files.write(path, data.script);

			// `timeout` returns 124 on expiry, which surfaces below as a plain
			// non-zero exit rather than a hung turn. E2B's own 60s command
			// ceiling is disabled (timeoutMs: 0) so this is the only clock.
			let result: { stdout: string; stderr: string; exitCode: number };
			try {
				result = await sandbox.commands.run(
					`timeout ${TIMEOUT_SECONDS} python3 ${path}`,
					{ cwd: WORKDIR, timeoutMs: 0 },
				);
			} catch (error) {
				// e2b throws on any non-zero exit; the error carries the result.
				if (!(error instanceof CommandExitError)) throw error;
				result = {
					stdout: error.stdout ?? '',
					stderr: error.stderr ?? '',
					exitCode: error.exitCode ?? 1,
				};
			}

			const stdout = truncate(result.stdout);
			const stderr = truncate(result.stderr);

			if (result.exitCode === 124) {
				return `Script exceeded ${TIMEOUT_SECONDS}s and was killed (${path}). Narrow the work and re-run.\n\n${stdout.text}`;
			}
			if (result.exitCode !== 0) {
				return [
					`Script failed (exit ${result.exitCode}) at ${path}.`,
					'Fix it and re-run; do not report a number you did not compute.',
					'',
					`stderr:\n${stderr.text}`,
				].join('\n');
			}

			const notes = [
				stderr.text === '' ? null : `stderr:\n${stderr.text}`,
				stdout.truncated || stderr.truncated
					? 'Output was truncated — print less, or aggregate first.'
					: null,
			].filter((note) => note !== null);

			return [stdout.text === '' ? '(no stdout)' : stdout.text, ...notes].join('\n\n');
		},
	});
}
