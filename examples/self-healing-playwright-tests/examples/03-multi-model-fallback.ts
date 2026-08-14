/**
 * Example 3 -- show the router fall back from a "broken" provider.
 *
 * We simulate the Anthropic outage of 15 April 2026 by overriding the
 * Anthropic key with a guaranteed-bad value. The router should detect
 * the auth failure and move on to OpenAI (or Google). The test still
 * gets generated and run.
 *
 * This is the production behavior that kept qualitymax.io serving
 * customers during that incident -- the architecture is the same here.
 *
 * Run:  pnpm tsx examples/03-multi-model-fallback.ts
 */

import 'dotenv/config';

import { route } from '../src/router.js';
import { runInSandbox } from '../src/runner.js';
import type { GeneratedTest } from '../src/types.js';

// Simulate the outage by poisoning Anthropic auth before the SDK reads it.
// We keep OpenAI / Google keys real so the fallback chain has somewhere
// to go.
process.env.ANTHROPIC_API_KEY = 'sk-ant-deliberately-invalid-for-demo';

const PROMPT = `You are an expert Playwright test author.
Output a single TypeScript file -- no markdown fences, no commentary.
Use @playwright/test, import { test, expect }.

Spec:
URL: https://e2b.dev
What to verify: page <title> is non-empty.

Return only the TypeScript file content.`;

async function main(): Promise<void> {
  console.log('→ Anthropic key is poisoned. Router should fall back.');
  const { text, provider } = await route(PROMPT);
  console.log(`✓ test generated -- the router landed on ${provider}`);

  const generated: GeneratedTest = { code: text.trim(), provider };
  const result = await runInSandbox(generated);
  console.log(result.passed ? '✓ test passed' : '✗ test failed');
  if (!result.passed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
