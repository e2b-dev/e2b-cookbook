/**
 * Healing loop: generate test → run → on failure, ask LLM to fix it
 * using the actual error output and a captured page snapshot, retry.
 *
 * Self-healing is the qualitymax.io feature this example demonstrates
 * on E2B's substrate. The pattern is small enough to copy into any
 * agent codebase that needs to keep brittle external tests running
 * across UI changes.
 */

import {
  type FailureType,
  type GeneratedTest,
  type HealAttempt,
  type HealingTrace,
  type TestSpec,
} from './types.js';
import { route } from './router.js';
import { runInSandbox } from './runner.js';

const DEFAULT_MAX_ATTEMPTS = Number.parseInt(
  process.env.HEAL_MAX_ATTEMPTS ?? '3',
  10,
);

/**
 * Instructions the LLM gets for both first-generation and healing.
 *
 * Note what we *don't* ask for: the LLM no longer has to remember to
 * dump page.content() on failure. The runner injects a controlled
 * `test.afterEach` hook for that (see `injectCaptureHook` in runner.ts).
 * Asking the LLM to do it produced three battle-tested failure modes
 * at qualitymax.io — see the hook's inline comment for the full story.
 *
 * We also forbid markdown fences so the runner can pipe the text
 * straight into a .ts file. Gemini in particular still occasionally
 * wraps output in fences; the router has a defensive `stripCodeFences`
 * pass for that, but the prompt belt-and-braces it.
 */
const SYSTEM_RULES = `You are an expert Playwright test author.
Output a single TypeScript file -- no markdown fences, no commentary.
The file must use @playwright/test and import { test, expect }.
Prefer robust selectors: getByRole / getByText / data-testid / data-test.
When multiple elements could match a locator, anchor by unique text and
walk up to a container, or scope by parent role. Never use [class*=...]
substring matchers -- they trigger strict-mode violations on real pages.`;

function buildGeneratePrompt(spec: TestSpec): string {
  return `${SYSTEM_RULES}

Write a Playwright test for the following spec:

URL: ${spec.url}
What to verify: ${spec.description}
${spec.context ? `Extra context: ${spec.context}` : ''}

Return only the TypeScript file content.`;
}

/**
 * Hint appended to the heal prompt for strict-mode violations.
 *
 * Battle-tested at qualitymax.io: without this, the healer treats a
 * "resolved to 4 elements" error the same as "resolved to 0 elements"
 * and frequently re-emits an equivalent fragile locator (e.g. swaps
 * `.first()` in, swaps another `[class*=…]` in). Burns the whole heal
 * budget on the same failure. Steering the LLM to one of three concrete
 * patterns turned the strict-mode failure mode from "blocks healing"
 * into "heals in one extra attempt" in our internal metrics.
 */
const STRICT_MODE_HINT = `
=== STRICT-MODE VIOLATION DETECTED ===
The failing locator matches multiple elements. Playwright's strict mode
rejects ambiguous locators. Do NOT add \`.first()\` blindly -- almost always
the right fix is one of:
  1. Anchor by unique text and walk up to the container:
     page.getByText('Total Balance').locator('..').getByText(/\\$\\d+/)
  2. Scope by parent role/region:
     page.getByRole('region', { name: 'Total Balance' }).getByText(/\\$\\d+/)
  3. Use the exact data-test attribute if one is in the page snapshot:
     page.locator('[data-test="total-balance"]')
Substring class matchers like [class*="balance"] are forbidden -- they always
hit multiple elements on a real page. Replace them with one of the above.`;

function buildHealPrompt(
  spec: TestSpec,
  previous: GeneratedTest,
  failure: {
    stdout: string;
    stderr: string;
    snapshot?: string;
    failureType?: FailureType;
  },
): string {
  const snapshotBlock = failure.snapshot
    ? `\nPage HTML at failure (truncated to 8000 chars):\n${failure.snapshot.slice(0, 8000)}\n`
    : '\nNo page snapshot was captured.\n';

  // Only inject the strict-mode hint when the failure is actually a
  // strict-mode violation. Including it unconditionally pollutes prompts
  // for unrelated failures (assertion mismatches, timeouts) and pushes
  // the LLM toward "fixing" non-issues.
  const failureHint = failure.failureType === 'strict_mode_violation' ? STRICT_MODE_HINT : '';

  return `${SYSTEM_RULES}

The previous test below failed. Fix it.

Spec:
URL: ${spec.url}
What to verify: ${spec.description}
${spec.context ? `Extra context: ${spec.context}` : ''}

Previous test:
${previous.code}

Failure stdout:
${failure.stdout.slice(0, 4000)}

Failure stderr:
${failure.stderr.slice(0, 2000)}
${failureHint}
${snapshotBlock}
Return only the new TypeScript file content.`;
}

async function generate(spec: TestSpec): Promise<GeneratedTest> {
  const { text, provider, usage } = await route(buildGeneratePrompt(spec));
  return { code: text.trim(), provider, usage };
}

async function heal(
  spec: TestSpec,
  previous: HealAttempt,
): Promise<GeneratedTest> {
  const { text, provider, usage } = await route(
    buildHealPrompt(spec, previous.generated, {
      stdout: previous.result.stdout,
      stderr: previous.result.stderr,
      snapshot: previous.result.failureSnapshot,
      failureType: previous.result.failureType,
    }),
  );
  return { code: text.trim(), provider, usage };
}

/**
 * Drive a test from natural-language spec to passing run, healing on
 * each failure. Returns the full attempt log so the caller can inspect
 * which provider produced which version.
 */
export async function runHealingTest(
  spec: TestSpec,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): Promise<HealingTrace> {
  const attempts: HealAttempt[] = [];
  let generated = await generate(spec);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await runInSandbox(generated);
    attempts.push({ attempt, generated, result });

    if (result.passed) {
      return { spec, attempts, finalPassed: true };
    }
    if (attempt === maxAttempts) {
      break;
    }
    generated = await heal(spec, attempts[attempts.length - 1]!);
  }

  return { spec, attempts, finalPassed: false };
}
