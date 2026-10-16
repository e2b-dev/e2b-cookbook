/**
 * The exec_js runtime. It runs inside the E2B desktop, never on your machine.
 *
 * code-exec.ts uploads this file and starts it once per desktop with a start URL. Like OpenAI's sample app, it launches
 * Playwright's own Chromium, visible on the desktop, opens one context and page on that URL, and listens on a Unix
 * socket. For each call, code-exec.ts writes the model's code to cell.js next to this
 * file and POSTs to the socket; the runtime runs cell.js in one shared context with Playwright's `browser`, `context`
 * and `page`, `console.log(value)`, `display(base64Image)`, and `desktop` for the rest of the screen (LibreOffice, the
 * taskbar) through scrot and xdotool. Variables saved on `globalThis` persist across calls.
 * The response is the JSON list of `input_text` and `input_image` items that the Responses API takes as a
 * `function_call_output`, so the host passes it through unchanged.
 *
 * Adapted from the Playwright worker in OpenAI's CUA sample app (github.com/openai/openai-cua-sample-app).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import http from 'node:http';
import util from 'node:util';
import vm from 'node:vm';
import { chromium } from 'playwright';

const SOCKET = '/tmp/exec_js.sock';
const CELL = new URL('cell.js', import.meta.url);
const SCREEN = new URL('screen.png', import.meta.url);
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

// Headful on the desktop's display, so the live view shows it; maximized, with the page filling the window.
const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
await page.goto(process.argv[2]);
context.setDefaultTimeout(10_000);
context.setDefaultNavigationTimeout(15_000);

const xdotool = (...args) => void execFileSync('xdotool', args.map(String));

// Playwright sees only the browser's pages; `desktop` reaches the rest of the screen (other apps, the taskbar, file
// dialogs) in screen coordinates, through scrot and xdotool.
const desktop = {
  screenshot: () => {
    rmSync(SCREEN, { force: true }); // scrot adds a suffix instead of overwriting
    execFileSync('scrot', ['--pointer', SCREEN.pathname]);
    return readFileSync(SCREEN).toString('base64');
  },
  click: (x, y) => xdotool('mousemove', '--sync', x, y, 'click', 1),
  doubleClick: (x, y) => xdotool('mousemove', '--sync', x, y, 'click', '--repeat', 2, 1),
  rightClick: (x, y) => xdotool('mousemove', '--sync', x, y, 'click', 3),
  drag: (x1, y1, x2, y2) =>
    xdotool('mousemove', '--sync', x1, y1, 'mousedown', 1, 'mousemove', '--sync', x2, y2, 'mouseup', 1),
  // Positive clicks scroll down, negative up.
  scroll: (x, y, clicks) => xdotool('mousemove', '--sync', x, y, 'click', '--repeat', Math.abs(clicks), clicks < 0 ? 4 : 5),
  type: (text) => xdotool('type', '--delay', 12, '--', text),
  key: (keys) => xdotool('key', '--', ...String(keys).split(' ')),
};

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
  desktop,
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
    const body = JSON.stringify(await execute(readFileSync(CELL, 'utf8')));
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
  })
  .listen(SOCKET);
