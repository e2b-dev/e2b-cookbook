import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { feedback } from "../lib/data";

/**
 * The only tool that produces something aimed at a system outside this agent.
 * It renders a draft and stops: publishing stays a separate, human action.
 * Feedback citations are checked against the corpus, so an invented id fails
 * here rather than reaching a tracker.
 */
export default defineTool({
  description:
    "Render a draft issue or research note for a synthesized theme, ready for a human to review and publish. Produces a draft only and never posts anywhere. Every claim must cite feedback response ids or a named analytics dataset; invented feedback ids are rejected.",
  approval: always(),
  inputSchema: z.object({
    title: z.string().min(8).describe("One line, phrased as the user problem rather than a fix."),
    destination: z.enum(["linear_issue", "notion_note"]).default("linear_issue"),
    problem_statement: z.string().min(40).describe("What is happening, for whom, and since when."),
    evidence: z
      .array(
        z.object({
          source: z.enum(["feedback", "analytics"]),
          ref: z
            .string()
            .describe(
              "A feedback response id such as fb_1042, or an analytics dataset id such as onboarding_activation.",
            ),
          note: z.string().min(10).describe("What this specific reference shows."),
        }),
      )
      .min(2)
      .describe("At least two references, and at least one from each source where possible."),
    confidence: z
      .enum(["low", "medium", "high"])
      .describe("How well the evidence supports the claim, not how strongly you feel about it."),
    open_questions: z
      .array(z.string())
      .min(1)
      .describe("What would have to be true, or measured, for this to be worth acting on."),
    proposed_next_step: z
      .string()
      .min(20)
      .describe("The smallest reversible action that would resolve the biggest open question."),
  }),
  async execute(input) {
    const knownIds = new Set(feedback.responses.map((response) => response.id));
    const unknownRefs = input.evidence
      .filter((item) => item.source === "feedback" && !knownIds.has(item.ref))
      .map((item) => item.ref);

    if (unknownRefs.length > 0) {
      return {
        status: "rejected" as const,
        reason: `These feedback ids are not in the corpus: ${unknownRefs.join(", ")}. Re-run search_feedback and cite real response ids.`,
      };
    }

    const evidenceLines = input.evidence
      .map((item) => `- \`${item.ref}\` (${item.source}) — ${item.note}`)
      .join("\n");
    const questionLines = input.open_questions.map((question) => `- ${question}`).join("\n");

    const markdown = [
      `# ${input.title}`,
      "",
      "## Problem",
      input.problem_statement,
      "",
      `## Evidence (confidence: ${input.confidence})`,
      evidenceLines,
      "",
      "## Open questions",
      questionLines,
      "",
      "## Proposed next step",
      input.proposed_next_step,
      "",
      "---",
      "_Draft prepared from dashboard feedback and the product analytics export. Not published._",
    ].join("\n");

    return {
      status: "draft_ready" as const,
      destination: input.destination,
      published: false,
      title: input.title,
      markdown,
      cited_feedback_ids: input.evidence
        .filter((item) => item.source === "feedback")
        .map((item) => item.ref),
    };
  },
  toModelOutput(output) {
    if (output.status === "rejected") {
      return { type: "text" as const, value: output.reason };
    }
    return {
      type: "text" as const,
      value: `Draft ready for ${output.destination} (not published): "${output.title}". Show it to the user and ask whether to publish.`,
    };
  },
});
