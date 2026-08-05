import { defineTool } from "eve/tools";
import { z } from "zod";
import { analytics } from "../lib/data";

/**
 * Every response carries the export's `known_gaps` so the model cannot read a
 * number without also seeing what that number does not cover.
 */
export default defineTool({
  description:
    "Read the product analytics export: the onboarding activation funnel, weekly trends (template build duration, sandbox start latency, invite acceptance), service health and incidents, and release annotations. Use this to check whether a quantitative claim is supported before making it.",
  inputSchema: z.object({
    dataset: z.enum(["funnel", "trend", "service_health", "annotations", "index"]),
    id: z
      .string()
      .optional()
      .describe(
        "Funnel or trend id, for example onboarding_activation, template_build_duration, sandbox_start_latency, invite_acceptance. Omit with dataset=index to list what is available.",
      ),
  }),
  async execute(input) {
    const known_gaps = analytics.export.known_gaps;
    const source = analytics.export.source;

    switch (input.dataset) {
      case "index":
        return {
          source,
          window: analytics.export.window,
          funnels: analytics.funnels.map((funnel) => ({ id: funnel.id, name: funnel.name })),
          trends: analytics.trends.map((trend) => ({ id: trend.id, name: trend.name })),
          datasets: ["funnel", "trend", "service_health", "annotations"],
          known_gaps,
        };
      case "funnel": {
        const funnels =
          input.id === undefined
            ? analytics.funnels
            : analytics.funnels.filter((funnel) => funnel.id === input.id);
        return { source, funnels, known_gaps };
      }
      case "trend": {
        const trends =
          input.id === undefined
            ? analytics.trends
            : analytics.trends.filter((trend) => trend.id === input.id);
        return { source, trends, known_gaps };
      }
      case "service_health":
        return { source, service_health: analytics.service_health, known_gaps };
      case "annotations":
        return { source, annotations: analytics.annotations, known_gaps };
    }
  },
});
