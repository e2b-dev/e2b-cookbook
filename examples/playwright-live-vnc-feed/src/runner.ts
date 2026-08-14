/**
 * Drive a Playwright test inside a sandbox that already has a VNC
 * stack running (see `createLiveSandbox`).
 *
 * The test runs headed against Xvfb display :99; whatever Chromium
 * renders is what the noVNC URL streams to the user's tab.
 */

import { CommandExitError, type Sandbox } from '@e2b/code-interpreter';

const WORK_DIR = '/home/user/work';
const BROWSERS_PATH = '/app/node_modules/playwright-core/.local-browsers';
const TEST_FILE_PATH = `${WORK_DIR}/test.spec.ts`;

// Same pin reasoning as the self-healing example: @playwright/test
// needs to match the `playwright` version baked into the template, or
// the runner picks a different Chromium revision than the one on disk.
const PLAYWRIGHT_VERSION = '1.51.1';

const PLAYWRIGHT_CONFIG = (display: string): string => `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '${WORK_DIR}',
  reporter: 'list',
  // headless:false drives a real Chromium window into the Xvfb display
  // so x11vnc has something to capture. headless mode renders off-screen
  // and the noVNC tab would show a blank desktop.
  use: {
    headless: false,
    // 1280x720 matches the Xvfb screen we booted in vnc-setup.ts —
    // matching the viewport to the X screen keeps Chromium from
    // scrolling the rendered surface inside the framebuffer.
    viewport: { width: 1280, height: 720 },
    // Slow each action down so the human watching the noVNC tab can
    // actually see what's happening. Drop or override per-test if you
    // need raw speed instead of demo cadence.
    actionTimeout: 15000,
    launchOptions: {
      // env DISPLAY is set on the npx command, but Playwright reads
      // process.env at launch time so this is belt-and-braces. The
      // sandbox env may or may not propagate DISPLAY depending on
      // how the SDK builds the child process.
      env: { DISPLAY: '${display}' },
      slowMo: 250,
    },
  },
});
`;

export interface LiveRunResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Upload `test.spec.ts` and a Playwright config, install
 * `@playwright/test`, and run the test against the live display.
 *
 * The sandbox is *not* killed here — callers usually want to keep it
 * alive after the run so the noVNC tab can still load the final page
 * state. Kill it explicitly from the caller (or rely on the SDK's
 * default sandbox timeout to reap it).
 */
export async function runLiveTest(
  sandbox: Sandbox,
  testCode: string,
  display: string,
): Promise<LiveRunResult> {
  await sandbox.files.write(TEST_FILE_PATH, testCode);
  await sandbox.files.write(`${WORK_DIR}/playwright.config.ts`, PLAYWRIGHT_CONFIG(display));

  await sandbox.commands.run(
    `mkdir -p ${WORK_DIR} && cd ${WORK_DIR} && ` +
      `npm init -y >/dev/null && ` +
      `npm install --no-audit --no-fund --silent @playwright/test@${PLAYWRIGHT_VERSION}`,
    { timeoutMs: 120 * 1000 },
  );

  // Same `CommandExitError implements CommandResult` trick as the
  // self-healing example — a failed test is a *signal*, not a
  // try/catch fault. We need exitCode/stdout/stderr from the error
  // instance, not the rethrow.
  let exec: { exitCode: number; stdout: string; stderr: string };
  try {
    exec = await sandbox.commands.run(
      `DISPLAY=${display} PLAYWRIGHT_BROWSERS_PATH=${BROWSERS_PATH} ` +
        `npx playwright test --reporter=list 2>&1`,
      { cwd: WORK_DIR, timeoutMs: 5 * 60 * 1000 },
    );
  } catch (err) {
    if (!(err instanceof CommandExitError)) throw err;
    exec = err;
  }

  return {
    passed: exec.exitCode === 0,
    exitCode: exec.exitCode,
    stdout: exec.stdout,
    stderr: exec.stderr,
  };
}
