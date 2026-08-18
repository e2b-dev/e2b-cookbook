# Extension spec: E2B code interpreter for Pi

Build a Pi extension at `~/.pi/agent/extensions/e2b-code-interpreter.ts`.

## What it does

Registers a `run_python` tool that executes Python in a stateful Jupyter
kernel running in an isolated E2B cloud sandbox, using the
`@e2b/code-interpreter` npm package (already installed in
`~/.pi/agent/extensions/node_modules` — do not run npm).

## Requirements

1. Export a default factory `(pi: ExtensionAPI) => void`.
2. Register one tool with `pi.registerTool()`:
   - `name: "run_python"`, parameters: a single required string `code`
     (use `Type.Object`/`Type.String` from `typebox`).
   - Description must tell the model: state persists across calls
     (notebook-style), pandas/matplotlib are preinstalled, CSVs from
     `./data/` are staged in the sandbox at `data/`, and for charts it must
     end the cell with `plt.show()` — never set a matplotlib backend and
     never use `savefig`.
   - Add `promptGuidelines` telling the model to prefer `run_python` over
     bash for Python/data work.
3. Sandbox lifecycle:
   - Keep ONE sandbox for the whole session. Create it lazily inside the
     first `execute()` call with `Sandbox.create({ timeoutMs: 600000 })`
     (the `E2B_API_KEY` env var is set). Never create it in the factory.
   - On first creation, upload every file from `./data/` (relative to
     `ctx.cwd`) into the sandbox at `data/<name>` using `sandbox.files.write`.
   - Kill the sandbox in a `pi.on("session_shutdown", ...)` handler.
4. Executing code: `const execution = await sandbox.runCode(params.code, { onStdout, onStderr })`.
   - Stream combined output through the tool's `onUpdate` callback.
   - If `execution.error` is set, throw an Error containing name, value,
     and traceback.
5. Results returned to the LLM (`content: [{ type: "text", text }]`):
   - stdout, stderr, then the `.text` of any results without `.png`.
   - Every result with a `.png` (base64) must be written to
     `<ctx.cwd>/output/chart-NN.png` (create the directory, zero-padded
     counter) and reported in the text as `[chart saved to <path>]`.
   - If there is nothing to report, return `(no output)`.
6. TypeScript, single file, no other tools, commands, or UI.
7. The extension runs under Node.js. Use `node:fs/promises` and `node:path`
   for all file I/O and `Buffer.from(png, "base64")` for decoding. Never use
   `Bun`, `Deno`, or any other non-Node global — they do not exist here.

## API reference

Everything you need is below — do not read source code, type definitions,
or docs anywhere else.

Pi extension surface:

```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function myExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "run_python",
    label: "Run Python (E2B sandbox)",
    description: "…",                    // shown to the LLM
    promptGuidelines: ["…"],             // bullets added to the system prompt
    parameters: Type.Object({
      code: Type.String({ description: "…" }),
    }),
    // params is validated; ctx.cwd is the working directory
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: "partial…" }], details: {} });
      return { content: [{ type: "text", text: "final result" }], details: {} };
    },
  });

  pi.on("session_shutdown", async (_event, ctx) => { /* cleanup */ });
}
```

E2B code-interpreter surface (`@e2b/code-interpreter`):

```typescript
import { Sandbox } from "@e2b/code-interpreter";

const sandbox = await Sandbox.create({ timeoutMs: 600000 }); // uses E2B_API_KEY env
await sandbox.files.write([{ path: "data/sales.csv", data: "<file contents>" }]);
const execution = await sandbox.runCode(code, {
  onStdout: (msg) => { /* msg.line: string */ },
  onStderr: (msg) => { /* msg.line: string */ },
});
// execution.logs.stdout: string[], execution.logs.stderr: string[]
// execution.results: [{ text?: string, png?: string /* base64 */ }, …]
// execution.error: { name, value, traceback } | undefined
await sandbox.kill();
```

Node builtins (`node:fs/promises`, `node:path`) are available.
