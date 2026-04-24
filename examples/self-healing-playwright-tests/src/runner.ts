/**
 * E2B sandbox runner: writes a generated Playwright test file into a
 * fresh sandbox on E2B's `playwright-chromium` template (Playwright +
 * Chromium + system deps pre-baked), executes the test, and captures
 * pass/fail plus stdout/stderr.
 *
 * Each call spins up a new sandbox so failures are isolated. Cold start
 * is ~200ms on the pre-baked template; swap to `base` and add an
 * `installPlaywright` step if you need to demonstrate bring-your-own.
 */

import { CommandExitError, Sandbox } from '@e2b/code-interpreter';

import type { GeneratedTest, RunResult } from './types.js';

const TEMPLATE = 'playwright-chromium';

// Two-directory layout: the template's /app is owned by root and
// contains the pre-baked Playwright browser binaries, so we can't
// write our test files or install @playwright/test there. /home/user
// is user-writable; we keep tests and the test-runner package here and
// point PLAYWRIGHT_BROWSERS_PATH at /app's browser cache.
const WORK_DIR = '/home/user/work';
const BROWSERS_PATH = '/app/node_modules/playwright-core/.local-browsers';
const TEST_FILE_PATH = `${WORK_DIR}/test.spec.ts`;
const SNAPSHOT_PATH = `${WORK_DIR}/failure.html`;

// Pin @playwright/test to match the version of `playwright` bundled in
// the template (check with `cat /app/package.json` in a probe sandbox).
// Version skew between the test runner and the browser binaries causes
// "chrome-headless-shell-<rev>: cannot execute binary" type failures.
const PLAYWRIGHT_VERSION = '1.51.1';

/**
 * Write the generated test into the sandbox along with a small Playwright
 * config that drops the test runner into the working directory.
 */
async function prepareSandbox(sandbox: Sandbox, code: string): Promise<void> {
  await sandbox.files.write(TEST_FILE_PATH, code);
  await sandbox.files.write(
    `${WORK_DIR}/playwright.config.ts`,
    `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '${WORK_DIR}',
  reporter: 'list',
  use: { headless: true },
});
`,
  );
}

/**
 * The `playwright-chromium` template ships with `playwright` + browser
 * binaries pre-installed at /app, but not `@playwright/test` (the test
 * runner). Create a user-writable work dir and install just that --
 * cheap (~5-10s) compared to a full browser install.
 *
 * If E2B later adds `@playwright/test` to the template at a location
 * we can resolve from, this function can be deleted.
 */
async function ensureTestRunner(sandbox: Sandbox): Promise<void> {
  await sandbox.commands.run(
    `mkdir -p ${WORK_DIR} && ` +
      `cd ${WORK_DIR} && ` +
      `npm init -y >/dev/null && ` +
      `npm install --no-audit --no-fund --silent @playwright/test@${PLAYWRIGHT_VERSION}`,
    { timeoutMs: 120 * 1000 },
  );
}

/**
 * Best-effort capture of the page state at failure time. Reads the
 * snapshot file if the test wrote one (see HEALING_INSTRUCTIONS in
 * healer.ts which asks the LLM to dump page.content() on failure).
 */
async function tryReadSnapshot(sandbox: Sandbox): Promise<string | undefined> {
  try {
    const content = await sandbox.files.read(SNAPSHOT_PATH);
    return typeof content === 'string' ? content : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Run a generated test once in a fresh sandbox.
 *
 * Caller is responsible for retry / healing -- this function returns
 * structured output for one attempt only.
 */
export async function runInSandbox(
  generated: GeneratedTest,
): Promise<RunResult> {
  const sandbox = await Sandbox.create(TEMPLATE);
  try {
    await prepareSandbox(sandbox, generated.code);
    await ensureTestRunner(sandbox);

    // E2B's SDK throws CommandExitError on non-zero exit rather than
    // returning a result. For a test runner that's the wrong default --
    // a failed test IS the signal we want to capture and feed into the
    // healing loop. Catch the typed error and use it directly, since
    // CommandExitError implements CommandResult (exitCode/stdout/stderr
    // are getters on the instance itself).
    //
    // PLAYWRIGHT_BROWSERS_PATH points at the template's pre-installed
    // Chromium so @playwright/test doesn't try to download its own.
    let exec: { exitCode: number; stdout: string; stderr: string };
    try {
      exec = await sandbox.commands.run(
        `PLAYWRIGHT_BROWSERS_PATH=${BROWSERS_PATH} npx playwright test --reporter=list 2>&1`,
        { cwd: WORK_DIR, timeoutMs: 5 * 60 * 1000 },
      );
    } catch (err) {
      if (!(err instanceof CommandExitError)) throw err;
      exec = err;
    }

    const passed = exec.exitCode === 0;
    const failureSnapshot = passed ? undefined : await tryReadSnapshot(sandbox);

    return {
      passed,
      exitCode: exec.exitCode,
      stdout: exec.stdout,
      stderr: exec.stderr,
      failureSnapshot,
    };
  } finally {
    await sandbox.kill();
  }
}
