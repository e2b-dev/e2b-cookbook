/**
 * Sandbox boot shared by both entry points (scripts/dev.ts, scripts/synthesize-e2b.ts).
 *
 * Creates the E2B sandbox, stages the feedback corpus at `~/data/`, and installs
 * the analysis toolchain so `run_analysis` scripts can use pandas and render
 * matplotlib charts into the served report folder. The Eve variant bakes this
 * install into a reusable template snapshot; here it runs per session, in
 * parallel with staging, which costs ~half a minute on the first turn and keeps
 * the project free of a template build pipeline.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { Sandbox } from 'e2b';
import { REPORT_DIR } from '../tools/publish-report.ts';

export const SANDBOX_TTL_MS = 30 * 60_000;

export const DATA_DIR = '/home/user/data';

/** Unpinned: without a baked snapshot there is nothing to keep reproducible, and
 * pins that drift out of sync with the base image's Python fail the whole boot. */
const PYTHON_PACKAGES = ['pandas', 'matplotlib'];

export async function createStagedSandbox(): Promise<Sandbox> {
	const sandbox = await Sandbox.create({ timeoutMs: SANDBOX_TTL_MS });
	console.error(`[e2b] sandbox created: ${sandbox.sandboxId}`);

	const dataDir = new URL('../../data/', import.meta.url);

	try {
		await Promise.all([
			...readdirSync(dataDir).map(async (name) => {
				await sandbox.files.write(
					`${DATA_DIR}/${name}`,
					readFileSync(new URL(name, dataDir), 'utf8'),
				);
				console.error(`[e2b] staged ~/data/${name}`);
			}),
			// The report folder exists up front so a script can drop charts and CSVs
			// beside the page without a mkdir of its own.
			sandbox.files.makeDir(REPORT_DIR),
			sandbox.commands
				.run(
					`python3 -m pip install --quiet --disable-pip-version-check ${PYTHON_PACKAGES.join(' ')}`,
					{ timeoutMs: 0 },
				)
				.then(() => console.error(`[e2b] analysis toolchain ready: ${PYTHON_PACKAGES.join(', ')}`)),
		]);
	} catch (error) {
		// A half-staged sandbox is useless and still bills, so don't leak it.
		await sandbox.kill();
		console.error(`[e2b] boot failed — sandbox killed: ${sandbox.sandboxId}`);
		throw error;
	}

	return sandbox;
}
