import { defineTool } from "eve/tools";
import { nanoid } from "nanoid";
import { z } from "zod";

/**
 * The escape hatch from the fixed tools. `search_feedback` and `feedback_stats`
 * answer the questions they were shaped for; this answers the ones they were
 * not — cross-tabs, cohort splits, repeat-writer detection, lining a feedback
 * series up against a trend week by week.
 *
 * The script runs in the agent's E2B sandbox against the same two exports the
 * other tools read, seeded at `/workspace/data/`. A non-zero exit is a normal
 * result, not an error: the traceback comes back so the model can fix its own
 * script rather than guessing at a number.
 */

/** Wall-clock ceiling per script. Eve disables E2B's own 60s command timeout. */
const TIMEOUT_SECONDS = 120;

/** Keep a runaway `print` loop from swallowing the context window. */
const MAX_STREAM_CHARS = 12_000;

function truncate(stream: string): { text: string; truncated: boolean } {
  const text = stream.trim();
  if (text.length <= MAX_STREAM_CHARS) return { text, truncated: false };
  return { text: `${text.slice(0, MAX_STREAM_CHARS)}\n…[truncated]`, truncated: true };
}

export default defineTool({
  description: [
    "Run a Python script in the sandbox over the raw feedback and analytics exports.",
    "Use this for any question the fixed tools cannot express: cross-tabs, cohort splits,",
    "repeat-writer detection, correlating a feedback series against a weekly trend.",
    "",
    "Environment: Python 3.11 with pandas, cwd /workspace, no network access.",
    "Data files, the same exports the other tools read:",
    "- data/dashboard-feedback-export.json — { export: {...}, responses: [...] }",
    "- data/product-analytics-export.json — { export: {...}, funnels, trends, service_health, annotations }",
    "",
    "Only stdout comes back, so print what you need. Print counts of responses AND",
    "distinct orgs whenever you size something. Read the file's own `export` block",
    "for caveats and known gaps before trusting a number you compute from it.",
  ].join("\n"),
  inputSchema: z.object({
    purpose: z
      .string()
      .min(10)
      .describe("The question this script answers, in one line. Shown to the user as the label."),
    script: z
      .string()
      .min(1)
      .describe("Python source. Runs from /workspace; print results to stdout."),
  }),
  async execute(input, ctx) {
    const sandbox = await ctx.getSandbox();
    const path = `analysis/${nanoid(8)}.py`;

    await sandbox.writeTextFile({ path, content: input.script });

    const result = await sandbox.run({
      // `timeout` returns 124 on expiry, which surfaces below as a plain
      // non-zero exit rather than a hung turn.
      command: `timeout ${TIMEOUT_SECONDS} python3 ${sandbox.resolvePath(path)}`,
    });

    const stdout = truncate(result.stdout);
    const stderr = truncate(result.stderr);

    return {
      purpose: input.purpose,
      script_path: path,
      exit_code: result.exitCode,
      timed_out: result.exitCode === 124,
      stdout: stdout.text,
      stderr: stderr.text,
      output_truncated: stdout.truncated || stderr.truncated,
    };
  },
  toModelOutput(output) {
    if (output.timed_out) {
      return {
        type: "text" as const,
        value: `Script exceeded ${TIMEOUT_SECONDS}s and was killed. Narrow the work and re-run.\n\n${output.stdout}`,
      };
    }
    if (output.exit_code !== 0) {
      return {
        type: "text" as const,
        value: `Script failed (exit ${output.exit_code}). Fix it and re-run; do not report a number you did not compute.\n\nstderr:\n${output.stderr}`,
      };
    }
    const notes = [
      output.stderr === "" ? null : `stderr:\n${output.stderr}`,
      output.output_truncated ? "Output was truncated — print less, or aggregate first." : null,
    ].filter((note) => note !== null);

    return {
      type: "text" as const,
      value: [output.stdout === "" ? "(no stdout)" : output.stdout, ...notes].join("\n\n"),
    };
  },
});
