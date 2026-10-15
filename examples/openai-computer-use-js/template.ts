/**
 * Build the E2B template that 1-run-code-exec.ts runs on: the stock desktop plus Node 22 and Playwright.
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
  // playwright-core only: the runtime drives the desktop's own Chrome, so no browser download.
  .runCmd(`mkdir -p ${RUNTIME_DIR} && cd ${RUNTIME_DIR} && npm install playwright-core@1.64.0`);

// The same size as the stock desktop template.
await Template.build(template, TEMPLATE, { cpuCount: 8, memoryMB: 8192, onBuildLogs: defaultBuildLogger() });
