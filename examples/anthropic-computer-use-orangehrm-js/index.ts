/**
 * Swivel chair: Claude copies new hires from an Excel file into OrangeHRM, an HR system with no API in reach, and
 * writes the IDs it assigns back into the spreadsheet. You watch it live on an E2B desktop.
 *
 *   npm run start
 *
 * Two toolsets share one desktop sandbox:
 * - computer use (`E2BComputerToolset`) reads and edits the spreadsheet in LibreOffice Calc through screenshots,
 *   mouse and keyboard, since Calc is a desktop app with nothing else to drive it by;
 * - browser use (`E2BBrowserToolset`) drives Chrome on the same screen through the page itself, which is faster and
 *   more precise than clicking pixels for a web form.
 *
 * The sandbox can reach only the public OrangeHRM demo. The finished spreadsheet is downloaded to ./output.
 * `tui.*` only prints; remove those calls and this is plain package usage.
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { Sandbox } from '@e2b/desktop';
import { E2BBrowserToolset, E2BComputerToolset, allowHosts, liveView } from '@e2b/claude-toolsets';
import * as tui from './tui.ts';

const ORANGEHRM = 'opensource-demo.orangehrmlive.com'; // public demo, reset regularly; sign in as Admin / admin123
const SHEET = '/home/user/Desktop/new_hires.xlsx';

const task = `On this desktop, ${SHEET} is open in LibreOffice Calc. Each row is a new hire who needs to be added to OrangeHRM at https://${ORANGEHRM} (username Admin, password admin123).

1. Read the rows in Calc with the computer tools.
2. Click Chrome in the taskbar so it is in front, then sign in with the browser tools.
3. Chrome may now offer to save the password in its own popup. The browser tools cannot see or click Chrome's own popups, so take a screenshot with the computer tools and, if it is there, dismiss it with "No thanks" (or close it).
4. With the browser tools, for each row open PIM > Add Employee, fill in the first, middle and last name, keep the Employee Id OrangeHRM suggests, and save. Note the Employee Id of each one.
5. Bring Calc back to the front with the computer tools, type each Employee Id into the "OrangeHRM Employee Id" column of its row, and save with Ctrl+S, keeping the Excel format.

Finish with a short table: name and OrangeHRM Employee Id.`;

const desktop = await Sandbox.create({
  resolution: [1280, 800], // screenshots are sent at this size, which fits the model's image limits
  timeoutMs: 900_000,
  network: {
    allowPublicTraffic: false, // required: keeps Chrome's DevTools port and the desktop stream private
    maskRequestHost: 'localhost:${PORT}',
    allowOut: [ORANGEHRM], // the sandbox can reach only OrangeHRM (enforced by E2B)
    denyOut: ['0.0.0.0/0'],
  },
});
const view = await liveView(desktop).catch(async (error) => {
  await desktop.kill();
  throw error;
});
try {
  tui.header({ Task: task.split('\n')[0]!, Watch: view.url, Sandbox: desktop.sandboxId });

  // Seed the desktop: LibreOffice in the sandbox turns the CSV into a real .xlsx on the Desktop.
  tui.step('Seeding new_hires.xlsx on the desktop');
  await desktop.files.write('/tmp/new_hires.csv', await readFile('new_hires.csv', 'utf8'));
  await desktop.commands.run('soffice --headless --convert-to xlsx --outdir /home/user/Desktop /tmp/new_hires.csv', {
    timeoutMs: 120_000,
  });

  const browser = await E2BBrowserToolset.create({
    sandbox: desktop,
    urlPolicy: allowHosts([ORANGEHRM]), // the model may only navigate to OrangeHRM (enforced by the SDK)
  });
  try {
    // Open the spreadsheet after Chrome, so Calc is in front when Claude takes its first screenshot.
    tui.step('Opening it in LibreOffice Calc');
    await desktop.commands.run(`libreoffice --calc ${SHEET}`, { background: true });
    await desktop.commands.run('xdotool search --sync --name new_hires', { timeoutMs: 60_000 });

    const computer = await E2BComputerToolset.create(desktop, {
      confirm: () => true, // required for key, type and hold_key: approve every call (unattended)
    });
    try {
      const answer = await new Anthropic().beta.messages.toolRunner({
        model: 'claude-sonnet-5-5',
        max_tokens: 4096,
        tools: [tui.trace(browser), tui.trace(computer)],
        messages: [{ role: 'user', content: task }],
      });
      tui.done(answer);
    } finally {
      await computer.close();
    }
  } finally {
    await browser.close(); // the tool runner never closes a toolset; you do
  }

  await mkdir('output', { recursive: true });
  await writeFile('output/new_hires.xlsx', await desktop.files.read(SHEET, { format: 'bytes' }));
  tui.step('Downloaded the updated spreadsheet to output/new_hires.xlsx');
  await tui.holdOpen('close the desktop');
} finally {
  await view.stop();
  await desktop.kill();
}
