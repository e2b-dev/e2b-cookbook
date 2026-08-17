import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { analytics, type JsonValue } from '../shared/feedback-data.ts';

/**
 * Port of the Eve variant's `query_product_analytics`. Every response carries
 * the export's `known_gaps` so the model cannot read a number without also
 * seeing what that number does not cover.
 */
export const queryProductAnalytics = defineTool({
	name: 'query_product_analytics',
	description: [
		'Read the product analytics export: the onboarding activation funnel, weekly trends',
		'(template build duration, sandbox start latency, invite acceptance), service health and',
		'incidents, and release annotations. Use this to check whether a quantitative claim is',
		'supported before making it.',
	].join(' '),
	input: v.object({
		dataset: v.picklist(['funnel', 'trend', 'service_health', 'annotations', 'index']),
		id: v.optional(
			v.pipe(
				v.string(),
				v.description(
					'Funnel or trend id, for example onboarding_activation, template_build_duration, sandbox_start_latency, invite_acceptance. Omit with dataset=index to list what is available.',
				),
			),
		),
	}),
	async run({ data }) {
		const known_gaps = analytics.export.known_gaps;
		const source = analytics.export.source;

		// One `JsonValue`-typed payload rather than a return per branch: a union
		// of object literals picks up `prop?: undefined` members, and `undefined`
		// is not JSON, so Flue's output type rejects it.
		let payload: JsonValue;

		switch (data.dataset) {
			case 'index':
				payload = {
					source,
					window: analytics.export.window,
					funnels: analytics.funnels.map((funnel) => ({ id: funnel.id, name: funnel.name })),
					trends: analytics.trends.map((trend) => ({ id: trend.id, name: trend.name })),
					datasets: ['funnel', 'trend', 'service_health', 'annotations'],
					known_gaps,
				};
				break;
			case 'funnel':
				payload = {
					source,
					funnels:
						data.id === undefined
							? analytics.funnels
							: analytics.funnels.filter((funnel) => funnel.id === data.id),
					known_gaps,
				};
				break;
			case 'trend':
				payload = {
					source,
					trends:
						data.id === undefined
							? analytics.trends
							: analytics.trends.filter((trend) => trend.id === data.id),
					known_gaps,
				};
				break;
			case 'service_health':
				payload = { source, service_health: analytics.service_health, known_gaps };
				break;
			case 'annotations':
				payload = { source, annotations: analytics.annotations, known_gaps };
				break;
		}

		return { output: payload };
	},
});
