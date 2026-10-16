/**
 * Swivel chair with code execution: the same task as 2-orangehrm.ts, done the way OpenAI recommends for gpt-6-astra.
 *
 * gpt-6-astra copies new hires from an Excel file into OrangeHRM, an HR system with no API in reach, and writes the IDs
 * it assigns back into the spreadsheet. It gets one tool, exec_js, and writes code that runs inside the E2B desktop:
 * Playwright for OrangeHRM in Chromium, and the runtime's `desktop` helpers (scrot and xdotool) for LibreOffice Calc. You
 * watch it live.
 *
 * Build the template once with `npm run template`, then:
 *
 *   npm run orangehrm:code-exec
 *
 * The sandbox can reach only the public OrangeHRM demo. The finished spreadsheet is downloaded to ./output.
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Sandbox } from '@e2b/desktop';
import { MODEL, TEMPLATE, run, startRuntime } from './code-exec.ts';
import { holdOpen, liveView } from './e2b-driver.ts';

const ORANGEHRM = 'opensource-demo.orangehrmlive.com'; // public demo, reset regularly; sign in as Admin / admin123
const SHEET = '/home/user/Desktop/new_hires.xlsx';

const TASK = `On this desktop, ${SHEET} is open in LibreOffice Calc. Each row is a new hire who needs to be added to OrangeHRM at https://${ORANGEHRM} (username Admin, password admin123).

1. Read the rows in Calc.
2. Bring the Playwright page to the front with page.bringToFront(), open the OrangeHRM address in it and sign in. Do not open Chrome from the taskbar: Playwright controls only the Chromium window it opened.
3. Chromium may now offer to save the password in its own popup. If it is there, dismiss it with "No thanks" (or close it).
4. For each row open PIM > Add Employee, fill in the first, middle and last name, keep the Employee Id OrangeHRM suggests, and save. Note the Employee Id of each one.
5. Bring Calc back to the front, type each Employee Id into the "OrangeHRM Employee Id" column of its row, and save with Ctrl+S, keeping the Excel format.

Finish with a short table: name and OrangeHRM Employee Id.`;

const desktop = await Sandbox.create(TEMPLATE, {
  resolution: [1280, 800], // screenshots are sent at this size, which fits the model's image limits
  timeoutMs: 900_000,
  network: {
    allowOut: [ORANGEHRM], // the sandbox can reach only OrangeHRM (enforced by E2B)
    denyOut: ['0.0.0.0/0'],
  },
});
try {
  await liveView(desktop);
  console.log(`Task (${MODEL}, exec_js): ${TASK.split('\n')[0]}\n`);

  // Seed the desktop: LibreOffice in the sandbox turns the CSV into a real .xlsx on the Desktop.
  console.log('Seeding new_hires.xlsx on the desktop');
  await desktop.files.write('/tmp/new_hires.csv', await readFile('new_hires.csv', 'utf8'));
  await desktop.commands.run('soffice --headless --convert-to xlsx --outdir /home/user/Desktop /tmp/new_hires.csv', {
    timeoutMs: 120_000,
  });

  // The runtime and its Chromium first, Calc after them, so Calc is in front for the model's first screenshot. timeoutMs: 0
  // keeps Calc running past the 60 seconds a background command otherwise gets.
  console.log('Opening Chromium and LibreOffice Calc\n');
  await startRuntime(desktop, 'about:blank');
  await desktop.commands.run(`libreoffice --calc ${SHEET}`, { background: true, timeoutMs: 0 });
  await desktop.commands.run('xdotool search --sync --name new_hires', { timeoutMs: 60_000 });

  const answer = await run(desktop, TASK, { maxTurns: 100, timeLimitMs: 840_000 });
  console.log(`\n${answer}`);

  await mkdir('output', { recursive: true });
  await writeFile('output/new_hires.xlsx', await desktop.files.read(SHEET, { format: 'bytes' }));
  await writeFile('output/2-orangehrm-code-exec.png', await desktop.screenshot());
  console.log(
    '\nDownloaded the updated spreadsheet to output/new_hires.xlsx, final screen to output/2-orangehrm-code-exec.png',
  );
  await holdOpen();
} finally {
  await desktop.kill();
}
