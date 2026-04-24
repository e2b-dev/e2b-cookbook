/**
 * Multi-model router with fallback chain.
 *
 * Tries providers in order. On rate-limit, 5xx, or network error,
 * falls back to the next configured provider. Throws AllProvidersFailedError
 * if every provider fails for the same call.
 *
 * This is the same pattern qualitymax.io uses to survive single-provider
 * outages (the platform stayed up through the documented Anthropic
 * outage of 15 April 2026 because the router fell back to GPT and Gemini).
 */

import { generateText } from 'ai';
import type { LanguageModelV1 } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

import {
  AllProvidersFailedError,
  type ProviderName,
  type RouterConfig,
} from './types.js';

const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-7',
  openai: process.env.OPENAI_MODEL ?? 'gpt-5',
  google: process.env.GOOGLE_MODEL ?? 'gemini-2.5-pro',
};

const ENV_KEY_BY_PROVIDER: Record<ProviderName, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

function modelFor(provider: ProviderName, override?: string): LanguageModelV1 {
  const id = override ?? DEFAULT_MODELS[provider];
  switch (provider) {
    case 'anthropic':
      return anthropic(id);
    case 'openai':
      return openai(id);
    case 'google':
      return google(id);
  }
}

/**
 * Read the router config from env vars, with sensible defaults.
 *
 * Providers without a configured API key are silently dropped from the
 * order so that a partial setup still works.
 */
export function loadRouterConfig(): RouterConfig {
  const raw = process.env.ROUTER_ORDER ?? 'anthropic,openai,google';
  const requested = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ProviderName =>
      s === 'anthropic' || s === 'openai' || s === 'google',
    );
  const order = requested.filter((p) => Boolean(process.env[ENV_KEY_BY_PROVIDER[p]]));
  if (order.length === 0) {
    throw new Error(
      'No usable provider keys found. Set at least one of ' +
        `${Object.values(ENV_KEY_BY_PROVIDER).join(', ')} in your environment.`,
    );
  }
  return { order };
}

export interface RouteCallResult {
  text: string;
  provider: ProviderName;
  usage?: { promptTokens?: number; completionTokens?: number };
}

/**
 * Strip a single outer markdown fence if present.
 *
 * LLMs occasionally wrap their response in ```lang ... ``` despite
 * prompts that explicitly forbid it (Gemini is the usual offender).
 * Since every caller in this cookbook expects raw TypeScript that can
 * be written straight to a .ts file, we normalise at the router.
 *
 * Surgical by design: only strips when the trimmed text starts AND
 * ends with a fence, so response bodies that legitimately contain
 * inline fences are left alone.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return match ? match[1]! : trimmed;
}

/**
 * Try the configured providers in order until one returns a response.
 *
 * The error classification here is intentionally conservative -- on any
 * thrown error we move on to the next provider. Production code may want
 * to retry transient errors on the same provider before falling back.
 */
export async function route(
  prompt: string,
  config: RouterConfig = loadRouterConfig(),
): Promise<RouteCallResult> {
  const failures: { provider: ProviderName; error: Error }[] = [];

  for (const provider of config.order) {
    try {
      const model = modelFor(provider, config.models?.[provider]);
      const { text, usage } = await generateText({
        model,
        prompt,
        // Slightly lower temperature to keep generated test code stable.
        temperature: 0.2,
      });
      return {
        text: stripCodeFences(text),
        provider,
        usage: {
          promptTokens: usage?.promptTokens,
          completionTokens: usage?.completionTokens,
        },
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      failures.push({ provider, error: e });
      // Loop continues to the next provider in `order`.
    }
  }

  throw new AllProvidersFailedError(failures);
}
