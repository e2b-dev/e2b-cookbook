// The exports live under the sandbox seed folder so eve mirrors them into the
// E2B sandbox at /workspace/data/. Importing them from here keeps one copy on
// disk: the in-process tools read this module, `run_analysis` reads the same
// bytes as files inside the sandbox.
import analyticsExport from "../sandbox/workspace/data/product-analytics-export.json" with { type: "json" };
import feedbackExport from "../sandbox/workspace/data/dashboard-feedback-export.json" with { type: "json" };

export type FeedbackSurface = "onboarding_survey" | "dashboard_widget" | "cli_post_install";

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

export const feedback = feedbackExport as {
  export: {
    source: string;
    exported_at: string;
    window: { from: string; to: string };
    record_count: number;
    surfaces: Record<string, string>;
    notes: string[];
  };
  responses: FeedbackResponse[];
};

export const analytics = analyticsExport as {
  export: {
    source: string;
    exported_at: string;
    window: { from: string; to: string };
    timezone: string;
    known_gaps: string[];
  };
  funnels: Array<Record<string, unknown> & { id: string; name: string }>;
  trends: Array<Record<string, unknown> & { id: string; name: string }>;
  service_health: Record<string, unknown>;
  annotations: Array<{ date: string; text: string }>;
};

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
