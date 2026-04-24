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
 * Two non-obvious choices:
 *  - We explicitly ask for `await page.content()` to be written to
 *    /home/user/failure.html on failure. The runner reads that snapshot
 *    and feeds it back into the next heal attempt -- without this,
 *    healing degrades to guessing from stderr alone.
 *  - We forbid markdown fences in the response so the runner can pipe
 *    the text straight into a .ts file.
 */
const SYSTEM_RULES = `You are an expert Playwright test author.
Output a single TypeScript file -- no markdown fences, no commentary.
The file must use @playwright/test and import { test, expect }.
On failure, before throwing, write the current page HTML to /app/failure.html
using fs.writeFileSync so a follow-up agent can inspect the page state.`;

function buildGeneratePrompt(spec: TestSpec): string {
  return `${SYSTEM_RULES}

Write a Playwright test for the following spec:

URL: ${spec.url}
What to verify: ${spec.description}
${spec.context ? `Extra context: ${spec.context}` : ''}

Return only the TypeScript file content.`;
}

function buildHealPrompt(
  spec: TestSpec,
  previous: GeneratedTest,
  failure: { stdout: string; stderr: string; snapshot?: string },
): string {
  const snapshotBlock = failure.snapshot
    ? `\nPage HTML at failure (truncated to 8000 chars):\n${failure.snapshot.slice(0, 8000)}\n`
    : '\nNo page snapshot was captured.\n';

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
${snapshotBlock}
Return only the new TypeScript file content. Make selectors more robust;
prefer role / text / data-testid based selectors over brittle CSS paths.`;
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
