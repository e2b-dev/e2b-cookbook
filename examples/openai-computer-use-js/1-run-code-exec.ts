/**
 * Hello world with code execution: the same task as 1-run.ts, done the way OpenAI recommends for gpt-6-astra.
 *
 * Chromium on the desktop shows a folder with two orders. gpt-6-astra gets one tool, exec_js, and writes Playwright
 * code that runs inside the E2B desktop to open the priority order and read back its order number while you watch
 * live. The number is generated here and never sent in the prompt, so the answer is checked.
 *
 * Build the template once with `npm run template`, then:
 *
 *   npm run code-exec
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Sandbox } from '@e2b/desktop';
import { MODEL, TEMPLATE, run, startRuntime } from './code-exec.ts';
import { holdOpen, liveView } from './e2b-driver.ts';

const FOLDER = '/home/user/orders';
const TASK =
  'The browser shows a folder. Open priority-order.txt and return only its order number. Do not open other files.';

const desktop = await Sandbox.create(TEMPLATE, {
  resolution: [1280, 800], // screenshots are sent at this size, which fits the model's image limits
  timeoutMs: 300_000,
  network: { denyOut: ['0.0.0.0/0'] }, // no internet: this task needs none
});
try {
  await liveView(desktop);
  console.log(`Task (${MODEL}, exec_js): ${TASK}\n`);

  const orderNumber = randomBytes(6).toString('hex').toUpperCase();
  await desktop.files.write(`${FOLDER}/priority-order.txt`, `Order number: ${orderNumber}\nPriority: high\n`);
  await desktop.files.write(`${FOLDER}/standard-order.txt`, 'Order number: STANDARD-1001\nPriority: standard\n');
  await startRuntime(desktop, `file://${FOLDER}/`);

  const answer = await run(desktop, TASK, { maxTurns: 20, timeLimitMs: 180_000 });
  console.log(`\nAnswer: ${answer}`);
  const correct = answer.trim() === orderNumber;
  if (correct) console.log('Correct.');
  else {
    console.error(`Wrong: the order number is ${orderNumber}.`);
    process.exitCode = 1;
  }

  await mkdir('output', { recursive: true });
  await writeFile('output/1-run-code-exec.png', await desktop.screenshot());
  console.log('Final screen saved to output/1-run-code-exec.png');
  await holdOpen();
} finally {
  await desktop.kill();
}
