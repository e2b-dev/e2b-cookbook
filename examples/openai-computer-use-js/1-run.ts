/**
 * Hello world: OpenAI computer use on an E2B desktop, the task from OpenAI's guide.
 *
 * The file manager shows a folder with two orders. gpt-6-luna opens the priority one and reads back its order number
 * while you watch live. The number is generated here and never sent in the prompt, so the answer is checked.
 *
 *   npm run start
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Sandbox } from '@e2b/desktop';
import { MODEL, holdOpen, liveView, run } from './e2b-driver.ts';

const FOLDER = '/home/user/orders';
const TASK =
  'The file manager shows a folder. Open priority-order.txt and return only its order number. Do not open other files.';

const desktop = await Sandbox.create({
  resolution: [1280, 800], // screenshots are sent at this size, which fits the model's image limits
  timeoutMs: 300_000,
  network: { denyOut: ['0.0.0.0/0'] }, // no internet: this task needs none
});
try {
  await liveView(desktop);
  console.log(`Task (${MODEL}): ${TASK}\n`);

  const orderNumber = randomBytes(6).toString('hex').toUpperCase();
  await desktop.files.write(`${FOLDER}/priority-order.txt`, `Order number: ${orderNumber}\nPriority: high\n`);
  await desktop.files.write(`${FOLDER}/standard-order.txt`, 'Order number: STANDARD-1001\nPriority: standard\n');
  await desktop.open(FOLDER);
  await desktop.wait(3000);

  const answer = await run(desktop, TASK, { maxSteps: 15, timeLimitMs: 120_000 });
  console.log(`\nAnswer: ${answer}`);
  const correct = answer.trim() === orderNumber;
  console.log(correct ? 'Correct.' : `Wrong: the order number is ${orderNumber}.`);
  if (!correct) process.exitCode = 1;

  await mkdir('output', { recursive: true });
  await writeFile('output/1-run.png', await desktop.screenshot());
  console.log('Final screen saved to output/1-run.png');
  await holdOpen();
} finally {
  await desktop.kill();
}
