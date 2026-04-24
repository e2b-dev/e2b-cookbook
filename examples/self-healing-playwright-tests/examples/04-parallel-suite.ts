/**
 * Example 4 -- run multiple healing tests in parallel sandboxes.
 *
 * Each TestSpec gets its own isolated E2B sandbox so failures and
 * state don't leak between them. This is roughly how a real test
 * suite would be wired up against E2B in production.
 *
 * Run:  pnpm tsx examples/04-parallel-suite.ts
 */

import 'dotenv/config';

import { runHealingTest } from '../src/healer.js';
import type { TestSpec } from '../src/types.js';

const suite: TestSpec[] = [
  {
    url: 'https://e2b.dev',
    description: 'The page should mention "AI agents" somewhere on it.',
  },
  {
    url: 'https://e2b.dev/docs',
    description: 'There should be a link to the Cookbook somewhere on the page.',
  },
  {
    url: 'https://e2b.dev/blog',
    description: 'The page should list at least one blog post title.',
  },
];

async function main(): Promise<void> {
  const traces = await Promise.all(suite.map((spec) => runHealingTest(spec, 2)));

  let failed = 0;
  traces.forEach((trace) => {
    const status = trace.finalPassed ? '✓' : '✗';
    console.log(`${status} ${trace.spec.url} (${trace.attempts.length} attempts)`);
    if (!trace.finalPassed) failed++;
  });

  console.log(`\n${suite.length - failed}/${suite.length} passed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
