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

import type { GeneratedTest, RunPhase, RunResult } from './types.js';

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

// Sentinels used to bracket the injected page-snapshot hook so we can
// strip-and-reattach it on every heal pass. Without strip-and-reattach,
// successive heals either:
//   (a) drop the hook entirely → no snapshot → healing degrades to
//       guessing from stderr; or
//   (b) duplicate the hook → "Identifier '_fs' has already been
//       declared" SyntaxError → every retry fails before the test runs.
// Battle-tested at qualitymax.io after both modes bit us in production.
const HOOK_BEGIN = '// --- begin self-healing capture hook ---';
const HOOK_END = '// --- end self-healing capture hook ---';

// We inline `require('fs')` inside the callback rather than adding a
// top-level `import fs from 'fs'`. Two reasons:
//   1. The LLM-generated code may or may not already import fs — adding
//      our own import risks a duplicate binding.
//   2. If the LLM accidentally pastes the hook twice during a heal, two
//      top-level `_fs` bindings produce a SyntaxError that's invisible
//      until the next run. `require()` is cached and binding-free, so
//      duplication is harmless (the strip-and-reattach still runs).
const CAPTURE_HOOK = `${HOOK_BEGIN}
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    try {
      const _html = await page.content();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('fs').writeFileSync('${SNAPSHOT_PATH}', _html.substring(0, 60000));
    } catch (_e) {
      // Best-effort: a snapshot failure must never mask the real test failure.
    }
  }
});
${HOOK_END}`;

const HOOK_STRIP_RE = new RegExp(
  `\\n*${HOOK_BEGIN.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?${HOOK_END.replace(
    /[.*+?^${}()|[\\]\\\\]/g,
    '\\\\$&',
  )}\\n*`,
  'g',
);

/**
 * Remove a previously injected capture hook (idempotent).
 * Always strip then reattach on each heal — see HOOK_BEGIN comment.
 */
function stripCaptureHook(code: string): string {
  return code.includes(HOOK_BEGIN) ? code.replace(HOOK_STRIP_RE, '\n') : code;
}

/**
 * Append our controlled capture hook to the LLM-generated test.
 *
 * We do this server-side instead of asking the LLM to write the snapshot
 * itself (the obvious approach). Battle-tested reason: when the LLM is
 * responsible for the snapshot path, you accumulate three failure modes
 * none of which fail loudly:
 *
 *   1. LLM forgets the hook in the heal pass.
 *   2. LLM writes to a root-owned directory (`/app/...`) → EACCES,
 *      silent: the test fails for unrelated reasons and you have no DOM.
 *   3. LLM duplicates `import fs from 'fs'` on heal → SyntaxError.
 *
 * Injecting the hook ourselves makes the snapshot a guaranteed side-effect
 * of any failure, not a thing the agent might or might not remember to do.
 */
function injectCaptureHook(code: string): string {
  return `${stripCaptureHook(code).trimEnd()}\n\n${CAPTURE_HOOK}\n`;
}

export const _internals = { stripCaptureHook, injectCaptureHook, CAPTURE_HOOK };

/**
 * Write the generated test into the sandbox along with a small Playwright
 * config that drops the test runner into the working directory.
 */
async function prepareSandbox(sandbox: Sandbox, code: string): Promise<void> {
  await sandbox.files.write(TEST_FILE_PATH, injectCaptureHook(code));
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
 * Best-effort read of the page snapshot the injected hook writes on failure.
 *
 * We control where the snapshot lives (`SNAPSHOT_PATH`) and we control the
 * hook that writes it, so the only reasons the file is missing are:
 *   - the test crashed before page.content() resolved (e.g. browser launch
 *     failure); or
 *   - the failing fixture was so broken Playwright never reached afterEach.
 * In both cases we degrade gracefully and let the healer work from stderr.
 */
async function tryReadSnapshot(sandbox: Sandbox): Promise<string | undefined> {
  try {
    const content = await sandbox.files.read(SNAPSHOT_PATH);
    return typeof content === 'string' && content.length > 0 ? content : undefined;
  } catch {
    return undefined;
  }
}

export interface RunOptions {
  /** Optional progress callback fired on each in-sandbox phase boundary. */
  onProgress?: (phase: RunPhase, detail?: string) => void;
  /** Optional callback for raw stdout chunks as the sandbox emits them. */
  onStdoutChunk?: (chunk: string) => void;
  /** Optional callback for raw stderr chunks as the sandbox emits them. */
  onStderrChunk?: (chunk: string) => void;
}

/**
 * Parse phase markers out of streamed output.
 *
 * The in-sandbox runner echoes `QMAX_PHASE:<phase>` lines at known
 * boundaries; we surface those to the optional `onProgress` callback so
 * UI consumers can show "Installing @playwright/test…", "Running test…"
 * etc. without parsing arbitrary npm/Playwright output. The convention
 * is borrowed from qualitymax.io's progress bar — a sentinel grep
 * survives version bumps of npm/playwright that would break a regex on
 * their normal log output.
 */
const PHASE_RE = /QMAX_PHASE:([a-z_]+)/g;

function parsePhases(
  chunk: string,
  onProgress?: (phase: RunPhase, detail?: string) => void,
): void {
  if (!onProgress) return;
  let match: RegExpExecArray | null;
  PHASE_RE.lastIndex = 0;
  while ((match = PHASE_RE.exec(chunk)) !== null) {
    onProgress(match[1] as RunPhase);
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
  opts: RunOptions = {},
): Promise<RunResult> {
  opts.onProgress?.('sandbox_starting');
  const sandbox = await Sandbox.create(TEMPLATE);
  try {
    await prepareSandbox(sandbox, generated.code);
    opts.onProgress?.('project_uploaded');
    await ensureTestRunner(sandbox);
    opts.onProgress?.('deps_installed');

    // E2B's SDK throws CommandExitError on non-zero exit rather than
    // returning a result. For a test runner that's the wrong default --
    // a failed test IS the signal we want to capture and feed into the
    // healing loop. Catch the typed error and use it directly, since
    // CommandExitError implements CommandResult (exitCode/stdout/stderr
    // are getters on the instance itself).
    //
    // PLAYWRIGHT_BROWSERS_PATH points at the template's pre-installed
    // Chromium so @playwright/test doesn't try to download its own.
    //
    // The `echo QMAX_PHASE:test_started` markers are picked up by
    // `parsePhases` and forwarded to onProgress -- see the comment on
    // PHASE_RE for why we use sentinels instead of parsing npm output.
    const cmd =
      `echo QMAX_PHASE:test_started && ` +
      `PLAYWRIGHT_BROWSERS_PATH=${BROWSERS_PATH} ` +
      `npx playwright test --reporter=list 2>&1; ` +
      `status=$?; echo QMAX_PHASE:test_finished; exit $status`;

    let exec: { exitCode: number; stdout: string; stderr: string };
    try {
      exec = await sandbox.commands.run(cmd, {
        cwd: WORK_DIR,
        timeoutMs: 5 * 60 * 1000,
        onStdout: (chunk: string) => {
          opts.onStdoutChunk?.(chunk);
          parsePhases(chunk, opts.onProgress);
        },
        onStderr: (chunk: string) => {
          opts.onStderrChunk?.(chunk);
          parsePhases(chunk, opts.onProgress);
        },
      });
    } catch (err) {
      if (!(err instanceof CommandExitError)) throw err;
      exec = err;
    }

    const passed = exec.exitCode === 0;
    const failureSnapshot = passed ? undefined : await tryReadSnapshot(sandbox);
    opts.onProgress?.('artifacts_collected');

    return {
      passed,
      exitCode: exec.exitCode,
      stdout: exec.stdout,
      stderr: exec.stderr,
      failureSnapshot,
      failureType: passed ? undefined : classifyFailure(exec.stdout, exec.stderr),
    };
  } finally {
    await sandbox.kill();
  }
}

/**
 * Classify a Playwright failure into one of a small set of buckets.
 *
 * The buckets are tuned for what the healer can actually act on:
 *   - `strict_mode_violation` → tell the LLM how to disambiguate
 *     (anchor by unique text, scope by parent role, use data-testid).
 *   - `locator_not_found` → broaden the selector strategy.
 *   - `timeout` → wait for network/load state, not bare element.
 *   - `assertion_failed` → likely the expected value changed, not the
 *     locator; tell the LLM to use a less specific assertion.
 *
 * Battle-tested ordering: strict-mode check before "locator …" because
 * strict-mode errors *contain* "locator" in their message and would
 * otherwise be mis-bucketed.
 */
export function classifyFailure(
  stdout: string,
  stderr: string,
): RunResult['failureType'] {
  const text = `${stdout}\n${stderr}`.toLowerCase();
  if (/strict mode violation.*resolved to \d+ elements?/.test(text)) {
    return 'strict_mode_violation';
  }
  if (/locator|selector|waiting for/.test(text)) {
    return 'locator_not_found';
  }
  if (/timeout/.test(text)) return 'timeout';
  if (/assertion|expect\(/.test(text)) return 'assertion_failed';
  return 'unknown';
}
