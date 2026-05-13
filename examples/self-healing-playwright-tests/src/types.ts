/**
 * Shared types for the self-healing test runner.
 *
 * The flow:
 *   1. caller describes a test in natural language       → TestSpec
 *   2. router asks an LLM to write Playwright code       → GeneratedTest
 *   3. runner executes the test inside an E2B sandbox    → RunResult
 *   4. on failure, healer asks the LLM to fix it         → HealAttempt
 *   5. loop until pass or HEAL_MAX_ATTEMPTS is hit       → HealingTrace
 */

export type ProviderName = 'anthropic' | 'openai' | 'google';

/**
 * Coarse classification of the failure so the healer can steer the next
 * prompt. Battle-tested at qualitymax.io: without this, the healer treats
 * "selector matches 4 elements" and "selector matches 0 elements" the
 * same way and keeps emitting equivalent locators.
 */
export type FailureType =
  | 'strict_mode_violation'
  | 'locator_not_found'
  | 'timeout'
  | 'assertion_failed'
  | 'unknown';

/**
 * Sentinel phase emitted by the in-sandbox runner script. Surfaced via
 * the optional `onProgress` callback on `runInSandbox` so callers driving
 * a UI / CI can show real progress instead of an opaque "running…".
 */
export type RunPhase =
  | 'sandbox_starting'
  | 'project_uploaded'
  | 'deps_installed'
  | 'test_started'
  | 'test_finished'
  | 'artifacts_collected';

export interface TestSpec {
  /** Natural-language description of what the test should do. */
  description: string;
  /** Target URL the test should drive. */
  url: string;
  /** Optional extra context for the LLM (selectors, expected text, etc.). */
  context?: string;
}

export interface GeneratedTest {
  /** TypeScript Playwright test file content. */
  code: string;
  /** Provider that produced the code. */
  provider: ProviderName;
  /** Token usage if reported by the provider. */
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface RunResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Snapshot of the failing page (HTML), if the runner managed to capture one. */
  failureSnapshot?: string;
  /** Coarse classification of the failure, populated when !passed. */
  failureType?: FailureType;
}

export interface HealAttempt {
  attempt: number;
  generated: GeneratedTest;
  result: RunResult;
}

export interface HealingTrace {
  spec: TestSpec;
  attempts: HealAttempt[];
  finalPassed: boolean;
}

export interface RouterConfig {
  /** Order in which providers are tried. */
  order: ProviderName[];
  /** Per-provider model id override. */
  models?: Partial<Record<ProviderName, string>>;
}

export class AllProvidersFailedError extends Error {
  constructor(
    public attempts: { provider: ProviderName; error: Error }[],
  ) {
    const summary = attempts
      .map((a) => `${a.provider}: ${a.error.message}`)
      .join(' | ');
    super(`All configured providers failed -- ${summary}`);
    this.name = 'AllProvidersFailedError';
  }
}
