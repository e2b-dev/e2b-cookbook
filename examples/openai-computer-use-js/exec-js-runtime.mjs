/**
 * The exec_js runtime. It runs inside the E2B desktop, never on your machine.
 *
 * code-exec.ts uploads this file and starts it once per desktop, after Chrome. It connects Playwright to that Chrome
 * over CDP and listens on a Unix socket; each POST body is JavaScript that runs in one shared context with Playwright's
 * `browser`, `context` and `page`, `console.log(value)` and `display(base64Image)`. Variables saved on `globalThis`
 * persist across calls. The response is the JSON list of `input_text` and `input_image` items that the Responses API
 * takes as a `function_call_output`, so the host passes it through unchanged.
 *
 * Adapted from the Playwright worker in OpenAI's CUA sample app (github.com/openai/openai-cua-sample-app).
 */
import { existsSync, unlinkSync } from 'node:fs';
import http from 'node:http';
import util from 'node:util';
import vm from 'node:vm';
import { chromium } from 'playwright-core';

const SOCKET = '/tmp/exec_js.sock';
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = context.pages()[0];
context.setDefaultTimeout(10_000);
context.setDefaultNavigationTimeout(15_000);

let output = [];
let outputBytes = 0;

function append(item) {
  outputBytes += Buffer.byteLength(JSON.stringify(item));
  if (outputBytes > MAX_OUTPUT_BYTES) throw new Error('exec_js output exceeds 8 MiB.');
  output.push(item);
}

const repl = vm.createContext({
  browser,
  context,
  page,
  Buffer,
  setTimeout,
  console: {
    log: (...values) => append({ type: 'input_text', text: util.formatWithOptions({ maxStringLength: 2_000 }, ...values) }),
  },
  display: (image) => {
    // Also take the Buffer page.screenshot() returns, a common first try.
    if (Buffer.isBuffer(image)) image = image.toString('base64');
    if (typeof image !== 'string') throw new Error('display expects a base64 image string.');
    append({
      type: 'input_image',
      detail: 'original',
      image_url: image.startsWith('data:image/') ? image : `data:image/png;base64,${image}`,
    });
  },
});

/** Run one exec_js call and collect what it logs and displays. */
async function execute(code) {
  output = [];
  outputBytes = 0;
  try {
    // Wrapped in an async function so the code can use top-level await.
    await new vm.Script(`(async () => {\n${code}\n})();`, { filename: 'exec_js.js' }).runInContext(repl);
  } catch (error) {
    // Report the error and keep the context so the model can fix its code.
    append({ type: 'input_text', text: String(error instanceof Error ? error.stack ?? error.message : error).slice(0, 4_000) });
  }
  return output.length ? output : [{ type: 'input_text', text: 'exec_js completed with no console output.' }];
}

if (existsSync(SOCKET)) unlinkSync(SOCKET);
http
  .createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.stringify(await execute(Buffer.concat(chunks).toString()));
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
  })
  .listen(SOCKET);
