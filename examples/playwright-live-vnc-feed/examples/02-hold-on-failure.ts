/**
 * Example 2 — pause-on-failure: when a test fails, keep the sandbox
 * alive so you can open the noVNC tab and inspect the broken state.
 *
 * This is the "Live tab stays after the test fails" pattern from the
 * qualitymax.io execution view. Without it, the moment the test errors
 * out the sandbox gets killed in the `finally` block and the noVNC
 * tab goes 502 — you never get to see what the page actually looked
 * like at failure.
 *
 * Run:  pnpm tsx examples/02-hold-on-failure.ts
 */

import 'dotenv/config';

import { createLiveSandbox } from '../src/vnc-setup.js';
import { runLiveTest } from '../src/runner.js';

// This test is *deliberately broken* — it looks for a heading that
// doesn't exist on the page so the failure path runs.
const FAILING_TEST_CODE = `
import { test, expect } from '@playwright/test';

test('intentionally fails so we can inspect', async ({ page }) => {
  await page.goto('https://playwright.dev');
  await expect(
    page.getByRole('heading', { name: 'This Heading Does Not Exist' }),
  ).toBeVisible({ timeout: 5000 });
});
`;

async function main(): Promise<void> {
  if (!process.env.E2B_API_KEY) {
    throw new Error('E2B_API_KEY is not set. Copy .env.template to .env and fill it in.');
  }

  console.log('booting sandbox + VNC stack...');
  const { sandbox, noVncUrl, display } = await createLiveSandbox();

  console.log(`\nLive URL: ${noVncUrl}\n`);

  try {
    const result = await runLiveTest(sandbox, FAILING_TEST_CODE, display);
    console.log(`test ${result.passed ? '✓ passed' : '✗ failed'} (exit ${result.exitCode})`);

    if (!result.passed) {
      // Pause-on-failure window. The browser is still up, still rendered
      // into the Xvfb display, still streamed via noVNC. Reload the URL
      // and you'll see whatever the page looks like at the moment of
      // failure — useful for diagnosing selector drift visually.
      const holdSeconds = Number.parseInt(process.env.POST_RUN_HOLD_SECONDS ?? '120', 10);
      console.log('');
      console.log(`✗ test failed — holding sandbox for ${holdSeconds}s so you can inspect.`);
      console.log(`  Reload the noVNC URL in your browser to see the failing page state:`);
      console.log(`  ${noVncUrl}`);
      console.log('');
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
