import { Sandbox } from "e2b";
import type { SandboxSession } from "eve/sandbox";
import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Serves a report the agent has already written to disk inside the sandbox and
 * hands back a public URL.
 *
 * It deliberately takes no HTML: `run_analysis` writes the file in the sandbox,
 * so chart bytes never travel through the model's context. This tool only
 * starts a static server and resolves the address.
 *
 * eve's `SandboxSession` is backend-neutral and exposes no host, port, or
 * sandbox id, so the URL is resolved through E2B directly. The join key is that
 * eve's `sandbox.id` is the same value `@e2b/eve-sandbox` stamps as the
 * `eveSessionKey` metadata on the sandbox it created — the same lookup the
 * backend itself uses to reattach a session.
 */

/** Everything under here is served. The agent writes its report into it. */
const REPORT_DIR = "/workspace/report";
const PORT = 8000;
const BIND_TIMEOUT_MS = 10_000;

/** True when something is listening on `PORT` inside the sandbox. */
async function serverIsUp(sandbox: SandboxSession) {
  const probe = await sandbox.run({
    command: `python3 -c "import socket,sys; sys.exit(0 if socket.socket().connect_ex(('127.0.0.1',${PORT}))==0 else 1)"`,
  });
  return probe.exitCode === 0;
}

export default defineTool({
  description: [
    "Publish a finished HTML report from the sandbox and return a public URL the user can open.",
    "",
    `Write the report to ${REPORT_DIR}/ with run_analysis FIRST, then call this. Requirements:`,
    `- the entry file is ${REPORT_DIR}/index.html unless you say otherwise`,
    "- inline every chart as a base64 <img> (matplotlib, Agg backend) and inline the CSS,",
    "  so the page is self-contained and one URL is the whole deliverable",
    "- anything else you drop in that folder (PNG, CSV) is served too, so the user can download it",
    "",
    "Starting the server is idempotent — calling this twice reuses the running one.",
  ].join("\n"),
  inputSchema: z.object({
    headline: z
      .string()
      .min(10)
      .describe("One line naming what the report shows. Shown to the user beside the link."),
    entry_file: z
      .string()
      .default("index.html")
      .describe(`Entry page inside ${REPORT_DIR}, relative. Defaults to index.html.`),
  }),
  async execute(input, ctx) {
    const sandbox = await ctx.getSandbox();
    const entryPath = `${REPORT_DIR}/${input.entry_file}`;

    const found = await sandbox.run({
      command: `test -f '${entryPath}' && echo FOUND || echo MISSING`,
    });
    if (found.stdout.trim() !== "FOUND") {
      return {
        status: "no_report" as const,
        expected_path: entryPath,
      };
    }

    if (!(await serverIsUp(sandbox))) {
      // Long-lived: eve's E2B backend spawns with E2B's command timeout
      // disabled, so this outlives the turn that started it.
      await sandbox.spawn({
        command: `python3 -m http.server ${PORT} --directory ${REPORT_DIR}`,
      });
      const deadline = Date.now() + BIND_TIMEOUT_MS;
      while (!(await serverIsUp(sandbox))) {
        if (Date.now() > deadline) {
          return { status: "server_failed" as const, expected_path: entryPath };
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    // `sandbox.id` is eve's session key, which the backend also writes to the
    // sandbox's `eveSessionKey` metadata. Scoping by backend too keeps a session
    // key from ever matching a sandbox this backend did not create.
    const [info] = await Sandbox.list({
      query: {
        metadata: { eveBackend: "e2b", eveSessionKey: sandbox.id },
        state: ["running"],
      },
      limit: 1,
    }).nextItems();

    if (!info) {
      return { status: "url_unavailable" as const, expected_path: entryPath };
    }

    const live = await Sandbox.connect(info.sandboxId);
    const base = `https://${live.getHost(PORT)}`;

    return {
      status: "published" as const,
      url: input.entry_file === "index.html" ? base : `${base}/${input.entry_file}`,
      headline: input.headline,
      sandbox_id: info.sandboxId,
    };
  },
  toModelOutput(output) {
    if (output.status === "no_report") {
      return {
        type: "text" as const,
        value: `Nothing at ${output.expected_path}. Use run_analysis to write the report there first, then call this again.`,
      };
    }
    if (output.status === "server_failed") {
      return {
        type: "text" as const,
        value: "The report server did not start. Check the script that wrote the report, then retry.",
      };
    }
    if (output.status === "url_unavailable") {
      return {
        type: "text" as const,
        value:
          "The report is built and served, but its public address could not be resolved. Tell the user the report exists in the sandbox but is not reachable.",
      };
    }
    return {
      type: "text" as const,
      value: [
        `Published: ${output.url}`,
        "",
        "Give the user this URL as a link and stop. Do not restate the report's contents —",
        "one or two sentences on the single most important finding is the whole reply.",
        "The link dies when the sandbox pauses (30 min idle); say so only if asked.",
      ].join("\n"),
    };
  },
});
