// Builds the Chromium sandbox template for the web target. Run it once per E2B team.
// The image tag must match the Playwright version that @e2e-dev/web uses (playwright-core in its package.json).
import { Template, defaultBuildLogger } from 'e2b';

const NAME = process.env.E2B_BROWSER_TEMPLATE || 'e2e-chromium';

const template = Template().fromImage('mcr.microsoft.com/playwright:v1.65.0-noble');

await Template.build(template, NAME, {
  cpuCount: 4,
  memoryMB: 4096,
  onBuildLogs: defaultBuildLogger(),
});
console.log(`Template ${NAME} is ready`);
