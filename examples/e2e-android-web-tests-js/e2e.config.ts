import { existsSync } from 'node:fs';
import { anthropic } from '@ai-sdk/anthropic';
import { e2b } from '@e2e-dev/e2b';
import { e2bBrowsers } from '@e2e-dev/e2b/web';
import { mobile } from '@e2e-dev/mobile';
import { mobileTools } from '@e2e-dev/mobile/tools';
import { web } from '@e2e-dev/web';
import type { E2EConfig } from 'e2e';

// e2e does not read .env, so load it before the providers look for E2B_API_KEY.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

// One Android 16 sandbox per worker. The provider installs the .apk and deletes the sandbox after the run.
const android = mobile({ platform: 'android', device: e2b() });

// One Chromium sandbox per worker, from the template that `npm run build-template` builds.
const chromium = web({
  browser: e2bBrowsers({ template: process.env.E2B_BROWSER_TEMPLATE || 'e2e-chromium' }),
});

export default {
  targets: [
    { name: 'android', engine: android, app: { appPath: 'apps/2048.apk' } },
    // The browser runs in E2B's cloud, so the URL must be reachable from the internet.
    { name: 'web', engine: chromium, app: { url: 'https://en.wikipedia.org' } },
  ],
  // Each worker is one sandbox per target, and the sandboxes run for the whole run.
  workers: 1,
  agents: {
    default: {
      // Only the agent tests call the model. They are skipped without ANTHROPIC_API_KEY.
      model: anthropic(process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5'),
      // Adds swipe, open_app and alert to the agent's taps and typing on Android.
      tools: mobileTools(android),
    },
  },
} satisfies E2EConfig;
