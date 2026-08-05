import { useModel, useSandbox, useSkill, useTool } from '@flue/runtime';
import type { Sandbox as E2BSandbox } from 'e2b';
import { e2b } from '../sandboxes/e2b.ts';
import { instructions, MODEL, playbook } from '../shared/source-data.ts';
import { draftIssue } from '../tools/draft-issue.ts';
import { feedbackStats } from '../tools/feedback-stats.ts';
import { publishReport, REPORT_DIR } from '../tools/publish-report.ts';
import { queryProductAnalytics } from '../tools/query-product-analytics.ts';
import { runAnalysis } from '../tools/run-analysis.ts';
import { searchFeedback } from '../tools/search-feedback.ts';

/**
 * E2B sandbox mode: the synthesizer does its analysis inside a
 * provider-managed Linux sandbox and delivers the result as a published HTML
 * report, not a wall of chat text. The caller owns the E2B sandbox lifecycle
 * and supplies it here — see `scripts/synthesize-e2b.ts` (one-shot) and
 * `scripts/dev.ts` (REPL). No `'use agent'` directive: this variant is only
 * ever started by those scripts via `start({ agents: [...] })`.
 *
 * The tool suite mirrors the Eve sibling: three in-process retrieval tools over
 * the same JSON exports, `run_analysis` for the computation the fixed tools
 * cannot express, `draft_issue` for a grounded draft that stops short of
 * publishing, and `publish_report` for the deliverable.
 *
 * `instructions.md` and the skill file are the verbatim upstream bundle and say
 * nothing about these tools, so the standing rules that make the suite work —
 * cite or drop, count orgs, fixed tool first — live in the addendum below.
 */

const E2B_MODE_ADDENDUM = `
# Environment (E2B sandbox mode)

You have two sources and no others:

- **Customer feedback** — the dashboard feedback widget, the onboarding survey,
  and the CLI post-build prompt. Read it with \`search_feedback\` and size it
  with \`feedback_stats\`.
- **Product analytics** — the onboarding activation funnel, weekly trends,
  service health, and release annotations. Read it with
  \`query_product_analytics\`.

Both exports are also staged as raw files inside your Linux sandbox at
\`~/data/\`. \`run_analysis\` runs a Python script there — pandas and matplotlib
are installed — when a question does not fit the fixed tools: a cross-tab, a
cohort split, repeat writers, a feedback series lined up against a weekly trend.
Same two sources, a freer way to ask them. Use \`run_analysis\` rather than raw
\`bash\` for anything that computes a number or writes the report.

# Standing rules

**Cite or drop it.** Every theme names the response ids behind it (\`fb_1042\`)
and every number names its dataset. A claim you cannot cite does not go in the
answer; it goes in the open questions. Never estimate a number you could compute.

**Count organizations, not just responses.** Six responses from two accounts is
a loud customer, not a theme. Report both numbers.

**Reach for the fixed tool first.** \`search_feedback\` and \`feedback_stats\`
return citable ids and carry the export's caveats with them. Use
\`run_analysis\` when the question genuinely does not fit one of them. A number
from a script is only as good as the script: if it exits non-zero, fix it and
re-run rather than reporting the number you expected.

**Volunteer the gaps.** Both exports ship their own caveats and known
instrumentation holes. Surface the ones that would change the conclusion.

**External writes stay drafts.** \`draft_issue\` renders a draft and stops. You
never describe an issue as filed, shared, or published.

# The deliverable

A published HTML report, not a prose reply. This is a live demo — favor speed,
but never at the cost of a number you did not compute.

1. Use \`run_analysis\` to write one self-contained page at
   ${REPORT_DIR}/index.html — inline CSS; charts either as inline SVG or as
   matplotlib PNGs written into ${REPORT_DIR}/ and inlined as base64 \`<img>\`.
   Write the \`.png\` and any \`.csv\` table into that folder too: it is served,
   so the underlying figures are one click away as downloads.
   Keep the page tight: scope, top 3 themes with one verbatim quote + response
   id each, the behavioral-signal comparison, the cross-tabs the question asked
   for, prioritized opportunities, what the data cannot tell yet, and the safest
   next action.
2. Call \`publish_report\` to serve it and get the public URL.
3. Reply with one or two sentences on the strongest finding plus the URL.
   Do not restate the report in chat.
`;

export function createE2bSynthesizer(sandbox: () => Promise<E2BSandbox>) {
	function ProductFeedbackSynthesizerE2b() {
		// Demo mode: no extended thinking — latency matters more than depth.
		useModel(MODEL, { thinkingLevel: 'off' });
		useSkill(playbook);

		// In-process over the JSON exports: fast, and every row they return is citable.
		useTool(searchFeedback);
		useTool(feedbackStats);
		useTool(queryProductAnalytics);
		// In-sandbox: the questions the fixed tools cannot express, and the report itself.
		useTool(runAnalysis(sandbox));
		useTool(draftIssue);
		useTool(publishReport(sandbox));

		useSandbox({
			// Lazy, per the SandboxFactory contract: the caller's sandbox is
			// only connected once, at initialization — never on a re-render.
			async createSandbox(options) {
				return e2b(await sandbox()).createSandbox(options);
			},
		});
		return instructions + E2B_MODE_ADDENDUM;
	}

	ProductFeedbackSynthesizerE2b.agentName = 'product-feedback-synthesizer-e2b';
	return ProductFeedbackSynthesizerE2b;
}
