import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { feedback } from '../shared/feedback-data.ts';

/**
 * The only tool that produces something aimed at a system outside this agent
 * (port of the Eve variant's `draft_issue`). It renders a draft and stops:
 * publishing stays a separate, human action. Feedback citations are checked
 * against the corpus, so an invented id fails here rather than reaching a
 * tracker.
 *
 * Eve gates this with `approval: always()`, which suspends the turn until a
 * human approves. Flue has no approval primitive; its nearest relative is
 * `terminate: true`, but that ends the turn once the tool batch settles, so
 * the draft would never reach the user in a closing message. Instead the
 * result carries the rendered draft plus an explicit stop instruction — the
 * behavior Eve's `toModelOutput` produced, minus the runtime gate.
 */
export const draftIssue = defineTool({
	name: 'draft_issue',
	description: [
		'Render a draft issue or research note for a synthesized theme, ready for a human to',
		'review and publish. Produces a draft only and never posts anywhere. Every claim must cite',
		'feedback response ids or a named analytics dataset; invented feedback ids are rejected.',
	].join(' '),
	input: v.object({
		title: v.pipe(
			v.string(),
			v.minLength(8),
			v.description('One line, phrased as the user problem rather than a fix.'),
		),
		destination: v.optional(v.picklist(['linear_issue', 'notion_note']), 'linear_issue'),
		problem_statement: v.pipe(
			v.string(),
			v.minLength(40),
			v.description('What is happening, for whom, and since when.'),
		),
		evidence: v.pipe(
			v.array(
				v.object({
					source: v.picklist(['feedback', 'analytics']),
					ref: v.pipe(
						v.string(),
						v.description(
							'A feedback response id such as fb_1042, or an analytics dataset id such as onboarding_activation.',
						),
					),
					note: v.pipe(
						v.string(),
						v.minLength(10),
						v.description('What this specific reference shows.'),
					),
				}),
			),
			v.minLength(2),
			v.description('At least two references, and at least one from each source where possible.'),
		),
		confidence: v.pipe(
			v.picklist(['low', 'medium', 'high']),
			v.description('How well the evidence supports the claim, not how strongly you feel about it.'),
		),
		open_questions: v.pipe(
			v.array(v.string()),
			v.minLength(1),
			v.description('What would have to be true, or measured, for this to be worth acting on.'),
		),
		proposed_next_step: v.pipe(
			v.string(),
			v.minLength(20),
			v.description('The smallest reversible action that would resolve the biggest open question.'),
		),
	}),
	async run({ data }) {
		const knownIds = new Set(feedback.responses.map((response) => response.id));
		const unknownRefs = data.evidence
			.filter((item) => item.source === 'feedback' && !knownIds.has(item.ref))
			.map((item) => item.ref);

		if (unknownRefs.length > 0) {
			return [
				`Rejected: these feedback ids are not in the corpus: ${unknownRefs.join(', ')}.`,
				'Re-run search_feedback and cite real response ids.',
			].join(' ');
		}

		const evidenceLines = data.evidence
			.map((item) => `- \`${item.ref}\` (${item.source}) — ${item.note}`)
			.join('\n');
		const questionLines = data.open_questions.map((question) => `- ${question}`).join('\n');

		const markdown = [
			`# ${data.title}`,
			'',
			'## Problem',
			data.problem_statement,
			'',
			`## Evidence (confidence: ${data.confidence})`,
			evidenceLines,
			'',
			'## Open questions',
			questionLines,
			'',
			'## Proposed next step',
			data.proposed_next_step,
			'',
			'---',
			'_Draft prepared from dashboard feedback and the product analytics export. Not published._',
		].join('\n');

		return [
			`Draft ready for ${data.destination} — NOT published.`,
			'',
			'Show this draft to the user verbatim and ask whether to publish it. Stop there:',
			'call no further tools this turn, and never describe the issue as filed or shared.',
			'',
			markdown,
		].join('\n');
	},
});
