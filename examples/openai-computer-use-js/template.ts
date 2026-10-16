/**
 * Build the E2B template that the code-exec examples run on: the stock desktop plus Node 22, Playwright and its Chromium.
 *
 * Run it once per E2B team; it takes a few minutes.
 *
 *   npm run template
 */
import 'dotenv/config';
import { Template, defaultBuildLogger } from 'e2b';
import { RUNTIME_DIR, TEMPLATE } from './code-exec.ts';

const template = Template()
  .fromTemplate('desktop')
  .setUser('root')
  .runCmd(['curl -fsSL https://deb.nodesource.com/setup_22.x | bash -', 'apt-get install -y nodejs'])
  .setUser('user')
  .setWorkdir('/home/user')
  // The runtime launches Playwright's own Chromium, as OpenAI's sample app does.
  .runCmd(`mkdir -p ${RUNTIME_DIR} && cd ${RUNTIME_DIR} && npm install playwright@1.64.0 && npx playwright install chromium`)
  .setUser('root')
  .runCmd(`cd ${RUNTIME_DIR} && npx playwright install-deps chromium`)
  .setUser('user');

// The same size as the stock desktop template.
await Template.build(template, TEMPLATE, { cpuCount: 8, memoryMB: 8192, onBuildLogs: defaultBuildLogger() });
