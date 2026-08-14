/**
 * Example 1 — watch a Playwright test drive a remote browser live.
 *
 * What you'll see when you run this:
 *
 *   1. The script creates a fresh E2B sandbox and boots Xvfb + x11vnc +
 *      websockify + noVNC inside it.
 *   2. The script prints a `https://...` URL. Open it in any browser
 *      tab — the noVNC client connects to the sandbox automatically.
 *   3. The script installs `@playwright/test` in the sandbox and runs
 *      a headed test against https://playwright.dev — you'll see
 *      Chromium drive the navigation in the noVNC tab in real time.
 *   4. After the test finishes the script sleeps for
 *      `POST_RUN_HOLD_SECONDS` (default 60s) so you can keep inspecting
 *      the final state. Then it kills the sandbox.
 *
 * Run:  pnpm tsx examples/01-watch-live-test.ts
 */

import 'dotenv/config';

import { createLiveSandbox } from '../src/vnc-setup.js';
import { runLiveTest } from '../src/runner.js';

const TEST_CODE = `
import { test, expect } from '@playwright/test';

test('navigates and finds get started', async ({ page }) => {
  await page.goto('https://playwright.dev');
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});
`;

async function main(): Promise<void> {
  if (!process.env.E2B_API_KEY) {
    throw new Error('E2B_API_KEY is not set. Copy .env.template to .env and fill it in.');
  }

  console.log('booting sandbox + VNC stack...');
  const { sandbox, noVncUrl, display } = await createLiveSandbox();

  console.log('');
  console.log('━'.repeat(72));
  console.log('  Open this URL in your browser to watch the test live:');
  console.log('');
  console.log(`  ${noVncUrl}`);
  console.log('━'.repeat(72));
  console.log('');
  console.log('starting test in 5s so you have time to open the URL...');
  await sleep(5000);

  try {
    const result = await runLiveTest(sandbox, TEST_CODE, display);
    console.log('');
    console.log(`test ${result.passed ? '✓ passed' : '✗ failed'} (exit ${result.exitCode})`);
    if (!result.passed) {
      console.log('--- stderr ---');
      console.log(result.stderr.slice(-2000));
    }

    const holdSeconds = Number.parseInt(process.env.POST_RUN_HOLD_SECONDS ?? '60', 10);
    if (holdSeconds > 0) {
      console.log('');
      console.log(`sandbox held for ${holdSeconds}s — reload the noVNC tab to see final state.`);
      console.log('(set POST_RUN_HOLD_SECONDS=0 in your env to skip this.)');
      await sleep(holdSeconds * 1000);
    }
  } finally {
    console.log('killing sandbox.');
    await sandbox.kill();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
