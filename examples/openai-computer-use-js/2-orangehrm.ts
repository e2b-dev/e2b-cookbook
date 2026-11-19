/**
 * Swivel chair: gpt-6-luna copies new hires from an Excel file into OrangeHRM, an HR system with no API in reach, and
 * writes the IDs it assigns back into the spreadsheet. You watch it live on an E2B desktop.
 *
 *   npm run orangehrm
 *
 * LibreOffice Calc and OrangeHRM in Chrome share one desktop, and the model drives both through screenshots, mouse and
 * keyboard. The sandbox can reach only the public OrangeHRM demo. The finished spreadsheet is downloaded to ./output.
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Sandbox } from '@e2b/desktop';
import { MODEL, holdOpen, liveView, run } from './e2b-driver.ts';

const ORANGEHRM = 'opensource-demo.orangehrmlive.com'; // public demo, reset regularly; sign in as Admin / admin123
const SHEET = '/home/user/Desktop/new_hires.xlsx';

const TASK = `On this desktop, ${SHEET} is open in LibreOffice Calc. Each row is a new hire who needs to be added to OrangeHRM at https://${ORANGEHRM} (username Admin, password admin123).

1. Read the rows in Calc.
2. Click Chrome in the taskbar so it is in front, open the OrangeHRM address and sign in.
3. Chrome may now offer to save the password in its own popup. If it is there, dismiss it with "No thanks" (or close it).
4. For each row open PIM > Add Employee, fill in the first, middle and last name, keep the Employee Id OrangeHRM suggests, and save. Note the Employee Id of each one.
5. Bring Calc back to the front, type each Employee Id into the "OrangeHRM Employee Id" column of its row, and save with Ctrl+S, keeping the Excel format.

Finish with a short table: name and OrangeHRM Employee Id.`;

const desktop = await Sandbox.create({
  resolution: [1280, 800], // screenshots are sent at this size, which fits the model's image limits
  timeoutMs: 900_000,
  network: {
    allowOut: [ORANGEHRM], // the sandbox can reach only OrangeHRM (enforced by E2B)
    denyOut: ['0.0.0.0/0'],
  },
});
try {
  await liveView(desktop);
  console.log(`Task (${MODEL}): ${TASK.split('\n')[0]}\n`);

  // Seed the desktop: LibreOffice in the sandbox turns the CSV into a real .xlsx on the Desktop.
  console.log('Seeding new_hires.xlsx on the desktop');
  await desktop.files.write('/tmp/new_hires.csv', await readFile('new_hires.csv', 'utf8'));
  await desktop.commands.run('soffice --headless --convert-to xlsx --outdir /home/user/Desktop /tmp/new_hires.csv', {
    timeoutMs: 120_000,
  });

  // Chrome first, Calc after it, so Calc is in front for the model's first screenshot. timeoutMs: 0 keeps both
  // running past the 60 seconds a background command otherwise gets.
  console.log('Opening Chrome and LibreOffice Calc\n');
  await desktop.commands.run(
    'google-chrome --user-data-dir=/tmp/chrome --no-first-run --no-default-browser-check ' +
      '--window-position=0,0 --window-size=1280,800 about:blank',
    { background: true, timeoutMs: 0 },
  );
  await desktop.commands.run('xdotool search --sync --class chrome', { timeoutMs: 60_000 });
  await desktop.commands.run(`libreoffice --calc ${SHEET}`, { background: true, timeoutMs: 0 });
  await desktop.commands.run('xdotool search --sync --name new_hires', { timeoutMs: 60_000 });

  const answer = await run(desktop, TASK, { maxSteps: 200, timeLimitMs: 840_000 });
  console.log(`\n${answer}`);

  await mkdir('output', { recursive: true });
  await writeFile('output/new_hires.xlsx', await desktop.files.read(SHEET, { format: 'bytes' }));
  await writeFile('output/2-orangehrm.png', await desktop.screenshot());
  console.log('\nDownloaded the updated spreadsheet to output/new_hires.xlsx, final screen to output/2-orangehrm.png');
  await holdOpen();
} finally {
  await desktop.kill();
}
