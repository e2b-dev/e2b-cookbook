/**
 * The feedback corpus, read in-process.
 *
 * Port of the Eve variant's `agent/lib/data.ts`. There is exactly one copy of
 * the exports on disk — `data/` at the project root. The in-process retrieval
 * tools read this module; `run_analysis` reads the same bytes as files inside
 * the sandbox, where the entry scripts stage them at `~/data/`.
 *
 * Read at runtime with `readFileSync` rather than a JSON import so the project
 * needs no `resolveJsonModule` / import-attribute plumbing — the same pattern
 * `source-data.ts` uses for the agent's markdown.
 */
import { readFileSync } from 'node:fs';

const dataRoot = new URL('../../data/', import.meta.url);

const readJson = <T>(fileName: string): T =>
	JSON.parse(readFileSync(new URL(fileName, dataRoot), 'utf8')) as T;

/**
 * The analytics export's funnels and trends are heterogeneous, so they stay
 * open-shaped — but typed as JSON rather than `unknown`, since a tool's
 * `output` has to be JSON-serializable for Flue to hand it to the model.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type FeedbackResponse = {
	id: string;
	submitted_at: string;
	surface: string;
	prompt: string | null;
	rating: number | null;
	product_area: string;
	user: string;
	org: string;
	plan: string;
	days_since_signup: number;
	sdk: string;
	text: string;
};

export const feedback = readJson<{
	export: {
		source: string;
		exported_at: string;
		window: { from: string; to: string };
		record_count: number;
		surfaces: Record<string, string>;
		notes: string[];
	};
	responses: FeedbackResponse[];
}>('dashboard-feedback-export.json');

export const analytics = readJson<{
	export: {
		source: string;
		exported_at: string;
		window: { from: string; to: string };
		timezone: string;
		known_gaps: string[];
	};
	funnels: Array<{ [key: string]: JsonValue; id: string; name: string }>;
	trends: Array<{ [key: string]: JsonValue; id: string; name: string }>;
	service_health: Record<string, JsonValue>;
	annotations: Array<{ date: string; text: string }>;
}>('product-analytics-export.json');

/** Inclusive on both ends; `from`/`to` are plain `YYYY-MM-DD` dates. */
export function withinRange(isoTimestamp: string, from?: string, to?: string): boolean {
	const day = isoTimestamp.slice(0, 10);
	if (from !== undefined && day < from) return false;
	if (to !== undefined && day > to) return false;
	return true;
}

/** Monday-anchored week key, matching the `week_start` values in the analytics export. */
export function weekStart(isoTimestamp: string): string {
	const date = new Date(`${isoTimestamp.slice(0, 10)}T00:00:00Z`);
	const dayOfWeek = (date.getUTCDay() + 6) % 7;
	date.setUTCDate(date.getUTCDate() - dayOfWeek);
	return date.toISOString().slice(0, 10);
}

export function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const item of items) {
		const bucket = key(item);
		counts[bucket] = (counts[bucket] ?? 0) + 1;
	}
	return counts;
}

/** Shared keyword match: response text, org, and user name, case-insensitive. */
export function matchesQuery(response: FeedbackResponse, needle: string | undefined): boolean {
	if (needle === undefined) return true;
	return `${response.text} ${response.org} ${response.user}`.toLowerCase().includes(needle);
}
