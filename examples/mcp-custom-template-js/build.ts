import { Template, defaultBuildLogger } from 'e2b';
import { template, alias } from './template';

async function buildTemplate() {
  console.log('Building custom E2B template with pre-installed MCP servers...');

  await Template.build(template, {
    alias,
    cpuCount: 8,
    memoryMB: 8192,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log('Custom template built successfully');
  console.log(`Template alias: ${alias}`);
}

buildTemplate().catch((error) => {
  console.error('Failed to run Claude Code example:', error);
  process.exit(1);
});

