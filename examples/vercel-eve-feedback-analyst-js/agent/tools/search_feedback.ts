import { defineTool } from "eve/tools";
import { z } from "zod";
import { countBy, feedback, withinRange } from "../lib/data";

/**
 * Primary retrieval tool. Returns verbatim responses so every theme the agent
 * asserts can be traced back to quoted evidence with a response id.
 */
export default defineTool({
  description:
    "Search customer feedback from the E2B dashboard feedback widget, the onboarding survey, and the CLI post-build prompt. Returns verbatim responses with ids for citation. Filter by date range, keyword, surface, plan, or product area. Prefer several narrow searches over one broad one.",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe("Case-insensitive keyword matched against response text, org, and user name."),
    from: z.string().optional().describe("Earliest submission date, YYYY-MM-DD, inclusive."),
    to: z.string().optional().describe("Latest submission date, YYYY-MM-DD, inclusive."),
    surface: z
      .enum(["onboarding_survey", "dashboard_widget", "cli_post_install"])
      .optional()
      .describe("Restrict to one collection surface."),
    plan: z.enum(["hobby", "pro", "enterprise_trial"]).optional(),
    product_area: z
      .enum(["teams_and_access", "templates", "sandboxes", "sdk", "docs", "billing"])
      .optional()
      .describe("Self-selected by the respondent, so treat it as a hint rather than a label."),
    max_rating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe("Keep only rated responses at or below this score."),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute(input) {
    const needle = input.query?.toLowerCase();

    const matches = feedback.responses.filter((response) => {
      if (!withinRange(response.submitted_at, input.from, input.to)) return false;
      if (input.surface !== undefined && response.surface !== input.surface) return false;
      if (input.plan !== undefined && response.plan !== input.plan) return false;
      if (input.product_area !== undefined && response.product_area !== input.product_area) {
        return false;
      }
      if (input.max_rating !== undefined) {
        if (response.rating === null || response.rating > input.max_rating) return false;
      }
      if (needle !== undefined) {
        const haystack = `${response.text} ${response.org} ${response.user}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    return {
      matched: matches.length,
      returned: Math.min(matches.length, input.limit),
      corpus_size: feedback.responses.length,
      corpus_window: feedback.export.window,
      facets: {
        by_surface: countBy(matches, (response) => response.surface),
        by_plan: countBy(matches, (response) => response.plan),
        by_product_area: countBy(matches, (response) => response.product_area),
      },
      responses: matches.slice(0, input.limit),
      collection_caveats: feedback.export.notes,
    };
  },
});
