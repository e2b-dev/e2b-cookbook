import { defineTool } from "eve/tools";
import { z } from "zod";
import { type FeedbackResponse, feedback, weekStart, withinRange } from "../lib/data";

const GROUPERS: Record<string, (response: FeedbackResponse) => string> = {
  week: (response) => weekStart(response.submitted_at),
  surface: (response) => response.surface,
  plan: (response) => response.plan,
  product_area: (response) => response.product_area,
  org: (response) => response.org,
  rating: (response) => (response.rating === null ? "unrated" : String(response.rating)),
};

/**
 * Sizes a theme honestly: a bucket's response count means little without the
 * number of distinct organizations behind it, so both are always returned.
 */
export default defineTool({
  description:
    "Count feedback responses by week, surface, plan, product area, org, or rating, optionally narrowed by keyword or date range. Use this to size a theme before claiming it is strong, and to check how many distinct organizations sit behind a count.",
  inputSchema: z.object({
    group_by: z.enum(["week", "surface", "plan", "product_area", "org", "rating"]),
    query: z.string().optional().describe("Same keyword match as search_feedback."),
    from: z.string().optional().describe("Earliest submission date, YYYY-MM-DD, inclusive."),
    to: z.string().optional().describe("Latest submission date, YYYY-MM-DD, inclusive."),
  }),
  async execute(input) {
    const needle = input.query?.toLowerCase();
    const matches = feedback.responses.filter((response) => {
      if (!withinRange(response.submitted_at, input.from, input.to)) return false;
      if (needle === undefined) return true;
      const haystack = `${response.text} ${response.org} ${response.user}`.toLowerCase();
      return haystack.includes(needle);
    });

    const grouper = GROUPERS[input.group_by];
    const buckets = new Map<string, { responses: FeedbackResponse[]; orgs: Set<string> }>();
    for (const response of matches) {
      const key = grouper(response);
      const bucket = buckets.get(key) ?? { responses: [], orgs: new Set<string>() };
      bucket.responses.push(response);
      bucket.orgs.add(response.org);
      buckets.set(key, bucket);
    }

    return {
      total_matched: matches.length,
      corpus_size: feedback.responses.length,
      distinct_orgs_matched: new Set(matches.map((response) => response.org)).size,
      buckets: [...buckets.entries()]
        .map(([key, bucket]) => ({
          key,
          responses: bucket.responses.length,
          distinct_orgs: bucket.orgs.size,
          mean_rating: meanRating(bucket.responses),
          response_ids: bucket.responses.map((response) => response.id),
        }))
        .sort((a, b) => (a.key < b.key ? -1 : 1)),
      collection_caveats: feedback.export.notes,
    };
  },
});

function meanRating(responses: readonly FeedbackResponse[]): number | null {
  const rated = responses.filter((response) => response.rating !== null);
  if (rated.length === 0) return null;
  const total = rated.reduce((sum, response) => sum + (response.rating ?? 0), 0);
  return Math.round((total / rated.length) * 100) / 100;
}
