import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { countBy, feedback, matchesQuery, withinRange } from '../shared/feedback-data.ts';

/**
 * Primary retrieval tool (port of the Eve variant's `search_feedback`). Returns
 * verbatim responses so every theme the agent asserts can be traced back to
 * quoted evidence with a response id.
 */
export const searchFeedback = defineTool({
	name: 'search_feedback',
	description: [
		'Search customer feedback from the E2B dashboard feedback widget, the onboarding survey,',
		'and the CLI post-build prompt. Returns verbatim responses with ids for citation.',
		'Filter by date range, keyword, surface, plan, or product area.',
		'Prefer several narrow searches over one broad one.',
	].join(' '),
	input: v.object({
		query: v.optional(
			v.pipe(
				v.string(),
				v.description('Case-insensitive keyword matched against response text, org, and user name.'),
			),
		),
		from: v.optional(
			v.pipe(v.string(), v.description('Earliest submission date, YYYY-MM-DD, inclusive.')),
		),
		to: v.optional(
			v.pipe(v.string(), v.description('Latest submission date, YYYY-MM-DD, inclusive.')),
		),
		surface: v.optional(
			v.pipe(
				v.picklist(['onboarding_survey', 'dashboard_widget', 'cli_post_install']),
				v.description('Restrict to one collection surface.'),
			),
		),
		plan: v.optional(v.picklist(['hobby', 'pro', 'enterprise_trial'])),
		product_area: v.optional(
			v.pipe(
				v.picklist(['teams_and_access', 'templates', 'sandboxes', 'sdk', 'docs', 'billing']),
				v.description(
					'Self-selected by the respondent, so treat it as a hint rather than a label.',
				),
			),
		),
		max_rating: v.optional(
			v.pipe(
				v.number(),
				v.integer(),
				v.minValue(1),
				v.maxValue(5),
				v.description('Keep only rated responses at or below this score.'),
			),
		),
		limit: v.optional(
			v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
			20,
		),
	}),
	async run({ data }) {
		const needle = data.query?.toLowerCase();

		const matches = feedback.responses.filter((response) => {
			if (!withinRange(response.submitted_at, data.from, data.to)) return false;
			if (data.surface !== undefined && response.surface !== data.surface) return false;
			if (data.plan !== undefined && response.plan !== data.plan) return false;
			if (data.product_area !== undefined && response.product_area !== data.product_area) {
				return false;
			}
			if (data.max_rating !== undefined) {
				if (response.rating === null || response.rating > data.max_rating) return false;
			}
			return matchesQuery(response, needle);
		});

		return {
			output: {
				matched: matches.length,
				returned: Math.min(matches.length, data.limit),
				corpus_size: feedback.responses.length,
				corpus_window: feedback.export.window,
				facets: {
					by_surface: countBy(matches, (response) => response.surface),
					by_plan: countBy(matches, (response) => response.plan),
					by_product_area: countBy(matches, (response) => response.product_area),
				},
				responses: matches.slice(0, data.limit),
				collection_caveats: feedback.export.notes,
			},
		};
	},
});
