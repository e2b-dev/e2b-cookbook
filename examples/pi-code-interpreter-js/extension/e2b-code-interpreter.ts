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
			// Headless sessions do not expose TUI status controls.
		}
	}

	async function getSandbox(ctx: ExtensionContext): Promise<Sandbox> {
		if (sandbox) return sandbox;

		setStatus(ctx, "creating sandbox…");
		const createdSandbox = await Sandbox.create({ timeoutMs: SANDBOX_TIMEOUT_MS });

		try {
			const dataDir = resolve(ctx.cwd, "data");
			const files = await readdir(dataDir).catch(() => [] as string[]);
			if (files.length > 0) {
				await createdSandbox.files.write(
					await Promise.all(
						files.map(async (name) => ({
							path: `data/${name}`,
							data: await readFile(join(dataDir, name), "utf8"),
						})),
					),
				);
			}
		} catch (error) {
			await createdSandbox.kill().catch(() => {});
			throw error;
		}

		sandbox = createdSandbox;
		setStatus(ctx, `sandbox ${createdSandbox.sandboxId}`);
		return createdSandbox;
	}

	async function saveCharts(execution: Execution, cwd: string): Promise<string[]> {
		const pngs = execution.results.flatMap((result) => (result.png ? [result.png] : []));
		if (pngs.length === 0) return [];

		const outputDir = join(cwd, "output");
		await mkdir(outputDir, { recursive: true });
		const saved: string[] = [];
		for (const png of pngs) {
			chartCount += 1;
			const path = join(outputDir, `chart-${String(chartCount).padStart(2, "0")}.png`);
			await writeFile(path, Buffer.from(png, "base64"));
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
			if (signal?.aborted) {
				return { content: [{ type: "text", text: "Cancelled" }], details: {} };
			}
			const sbx = await getSandbox(ctx);

			let streamed = "";
			const stream = (line: string) => {
				streamed += line;
				onUpdate?.({ content: [{ type: "text", text: streamed }], details: {} });
			};
			const execution = await sbx.runCode(params.code, {
				onStdout: (message) => stream(message.line),
				onStderr: (message) => stream(message.line),
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
		const activeSandbox = sandbox;
		sandbox = null;
		// Best-effort cleanup: a flaky kill must not throw inside Pi's
		// shutdown handler; the sandbox times out on its own regardless.
		await activeSandbox?.kill().catch(() => {});
	});
}
