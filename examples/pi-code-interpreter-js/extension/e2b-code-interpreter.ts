/**
 * E2B Code Interpreter extension for Pi
 *
 * Registers a `run_python` tool backed by an E2B sandbox. Pi's built-in
 * tools run on your machine; this one gives the agent a stateful Python
 * runtime in an isolated cloud sandbox instead — a persistent Jupyter
 * kernel, pandas/matplotlib preinstalled, and nothing executing locally.
 *
 * One sandbox per Pi session: created lazily on the first tool call,
 * killed on session shutdown. Variables survive across calls. matplotlib
 * output is captured by the kernel and saved to ./output/ as PNGs.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Sandbox, type Execution } from "@e2b/code-interpreter";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;

export default function e2bCodeInterpreter(pi: ExtensionAPI) {
	let sandbox: Sandbox | null = null;
	let chartCount = 0;

	function setStatus(ctx: ExtensionContext, text: string) {
		try {
			ctx.ui.setStatus("e2b", text);
		} catch {
			// no-op outside TUI mode
		}
	}

	// Create the sandbox on first use and stage ./data/ into it, so the
	// corpus is available at ~/data/ inside the sandbox.
	async function getSandbox(ctx: ExtensionContext): Promise<Sandbox> {
		if (sandbox) return sandbox;

		setStatus(ctx, "creating sandbox…");
		sandbox = await Sandbox.create({ timeoutMs: SANDBOX_TIMEOUT_MS });

		const dataDir = resolve(ctx.cwd, "data");
		const files = await readdir(dataDir).catch(() => [] as string[]);
		if (files.length > 0) {
			await sandbox.files.write(
				await Promise.all(
					files.map(async (name) => ({
						path: `data/${name}`,
						data: await readFile(join(dataDir, name), "utf8"),
					})),
				),
			);
		}

		setStatus(ctx, `sandbox ${sandbox.sandboxId}`);
		return sandbox;
	}

	// Persist any PNGs the kernel captured (matplotlib figures, images)
	// and return their local paths.
	async function saveCharts(execution: Execution, cwd: string): Promise<string[]> {
		const saved: string[] = [];
		for (const result of execution.results) {
			if (!result.png) continue;
			chartCount += 1;
			const path = join(cwd, "output", `chart-${String(chartCount).padStart(2, "0")}.png`);
			await mkdir(join(cwd, "output"), { recursive: true });
			await writeFile(path, Buffer.from(result.png, "base64"));
			saved.push(path);
		}
		return saved;
	}

	pi.registerTool({
		name: "run_python",
		label: "Run Python (E2B sandbox)",
		description:
			"Execute Python in a stateful Jupyter kernel running in an isolated E2B cloud sandbox. " +
			"Variables, imports, and dataframes persist across calls within the session. " +
			"pandas and matplotlib are preinstalled; the CSVs from ./data/ are staged at ~/data/ in the sandbox. " +
			"The last expression's value is returned like in a notebook cell. " +
			"matplotlib figures are captured automatically (call plt.show(), do not savefig) " +
			"and saved locally under ./output/.",
		promptSnippet: "Execute Python in an isolated, stateful E2B cloud sandbox",
		promptGuidelines: [
			"Use run_python for data analysis and plotting instead of running Python via bash — code runs in an isolated E2B cloud sandbox, not on this machine.",
			"run_python keeps state between calls: load data once, then iterate in small steps.",
			"For charts in run_python, end the cell with plt.show(); captured figures are saved to ./output/ automatically.",
		],
		parameters: Type.Object({
			code: Type.String({ description: "Python code to execute in the sandbox kernel" }),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const sbx = await getSandbox(ctx);
			if (signal?.aborted) {
				return { content: [{ type: "text", text: "Cancelled" }], details: {} };
			}

			let streamed = "";
			const execution = await sbx.runCode(params.code, {
				onStdout: (msg) => {
					streamed += msg.line;
					onUpdate?.({ content: [{ type: "text", text: streamed }], details: {} });
				},
				onStderr: (msg) => {
					streamed += msg.line;
					onUpdate?.({ content: [{ type: "text", text: streamed }], details: {} });
				},
			});

			if (execution.error) {
				throw new Error(
					`${execution.error.name}: ${execution.error.value}\n${execution.error.traceback}`,
				);
			}

			const charts = await saveCharts(execution, ctx.cwd);

			const parts: string[] = [];
			if (execution.logs.stdout.length > 0) parts.push(execution.logs.stdout.join(""));
			if (execution.logs.stderr.length > 0) parts.push(execution.logs.stderr.join(""));
			for (const result of execution.results) {
				if (result.text && !result.png) parts.push(result.text);
			}
			for (const path of charts) parts.push(`[chart saved to ${path}]`);
			if (parts.length === 0) parts.push("(no output)");

			return {
				content: [{ type: "text", text: parts.join("\n") }],
				details: { sandboxId: sbx.sandboxId, charts },
			};
		},
	});

	pi.on("session_shutdown", async () => {
		if (sandbox) {
			await sandbox.kill().catch(() => {});
			sandbox = null;
		}
	});
}
