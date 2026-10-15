/**
 * Code execution on an E2B desktop, the computer-use path OpenAI recommends for gpt-6-astra.
 *
 * Instead of the `computer` tool, the model gets one function tool, `exec_js`, and writes Playwright code against
 * Chrome on the desktop. That code runs in a persistent Node process inside the E2B desktop
 * ([`exec-js-runtime.mjs`](exec-js-runtime.mjs)), never on your machine, and returns its logs and screenshots to the
 * model.
 *
 * - `TEMPLATE` is the E2B template the desktop starts from: the stock desktop plus Node and Playwright, built by
 *   `template.ts`.
 * - `startRuntime` opens Chrome on a URL, then uploads the runtime and starts it.
 * - `run` is the Responses loop from OpenAI's code-execution guide, with each call sent to the desktop.
 */
import { readFile } from 'node:fs/promises';
import type { Sandbox } from '@e2b/desktop';
import OpenAI from 'openai';
import type { ResponseInputItem, ResponseInputMessageContentList } from 'openai/resources/responses/responses';

export const MODEL = process.env['OPENAI_MODEL'] ?? 'gpt-6-astra';
export const TEMPLATE = 'openai-computer-use-exec-js';

export const RUNTIME_DIR = '/home/user/.exec_js'; // template.ts installs playwright-core here
const SOCKET = '/tmp/exec_js.sock';
const CELL = `${RUNTIME_DIR}/cell.js`; // next to the runtime, which reads it on each call
const CALL_TIMEOUT_S = 60; // seconds one exec_js call may run

// The tool definition from OpenAI's guide, with this desktop's screen size.
const TOOL = {
  type: 'function' as const,
  name: 'exec_js',
  description: `Run JavaScript in a persistent browser. Available: Playwright's
browser, context, and page objects; console.log(value); and display(base64Image).
Save reusable variables on globalThis. Inspect a screenshot before acting and
check the screen after a short group of actions. Keep screenshots in memory.
Use top-level await for async operations. Return images with display() and concise
text with console.log(). Chrome is maximized on a 1280x800 screen.`,
  parameters: {
    type: 'object',
    properties: { code: { type: 'string' } },
    required: ['code'],
    additionalProperties: false,
  },
  strict: true,
};

/** Open Chrome maximized on `url` with CDP on, then upload the exec_js runtime, start it, and wait for its socket. */
export async function startRuntime(desktop: Sandbox, url: string) {
  await desktop.commands.run(
    `google-chrome --start-maximized --no-first-run --no-default-browser-check --remote-debugging-port=9222 ` +
      `--user-data-dir=${RUNTIME_DIR}/chrome '${url}'`,
    { background: true },
  );
  await desktop.commands.run(
    'for i in $(seq 300); do curl -fs http://127.0.0.1:9222/json/version >/dev/null && exit 0; sleep 0.1; done; exit 1',
    { timeoutMs: 40_000 }, // Chrome takes a few seconds to start on a fresh profile
  );
  await desktop.files.write(`${RUNTIME_DIR}/runtime.mjs`, await readFile(new URL('exec-js-runtime.mjs', import.meta.url), 'utf8'));
  await desktop.commands.run(`node ${RUNTIME_DIR}/runtime.mjs`, { background: true });
  await desktop.commands.run(`for i in $(seq 100); do [ -S ${SOCKET} ] && exit 0; sleep 0.1; done; exit 1`);
}

/** Run one exec_js call on the desktop and return its output items. */
export async function execJs(desktop: Sandbox, code: string): Promise<ResponseInputMessageContentList> {
  await desktop.files.write(CELL, code);
  const result = await desktop.commands.run(
    `curl -sS --fail -m ${CALL_TIMEOUT_S} --unix-socket ${SOCKET} -X POST http://exec_js/`,
    { timeoutMs: (CALL_TIMEOUT_S + 10) * 1000 },
  );
  return JSON.parse(result.stdout);
}

/** Print a call's code and its text output; screenshots appear as a placeholder. */
function show(code: string, output: ResponseInputMessageContentList) {
  console.log('  exec_js');
  for (const line of code.trim().split('\n')) console.log(`    | ${line}`);
  for (const item of output) console.log(`    > ${item.type === 'input_text' ? item.text.slice(0, 300) : '[screenshot]'}`);
}

/** Give the model a task in this desktop's browser and return its final answer. */
export async function run(
  desktop: Sandbox,
  task: string,
  { maxTurns, timeLimitMs }: { maxTurns: number; timeLimitMs: number },
): Promise<string> {
  const client = new OpenAI({ timeout: 120_000, maxRetries: 2 });
  const deadline = Date.now() + timeLimitMs;
  let nextInput: string | ResponseInputItem[] = task;
  let previousResponseId: string | undefined;

  for (let turn = 0; turn < maxTurns && Date.now() < deadline; turn++) {
    const response = await client.responses.create({
      model: MODEL,
      tools: [TOOL],
      input: nextInput,
      previous_response_id: previousResponseId,
      reasoning: { effort: 'low' },
    });
    if (response.status !== 'completed') throw new Error(`Response stopped with status: ${response.status}`);
    const calls = response.output.filter((item) => item.type === 'function_call');
    if (calls.length === 0) return response.output_text;

    nextInput = [];
    for (const call of calls) {
      if (call.name !== 'exec_js') throw new Error(`Unexpected tool: ${call.name}`);
      const { code } = JSON.parse(call.arguments) as { code: string };
      const output = await execJs(desktop, code);
      show(code, output);
      nextInput.push({ type: 'function_call_output', call_id: call.call_id, output });
    }
    previousResponseId = response.id;
  }
  throw new Error(`No answer within ${maxTurns} model calls or ${timeLimitMs / 1000} seconds.`);
}
