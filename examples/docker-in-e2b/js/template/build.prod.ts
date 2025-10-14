import { Template, defaultBuildLogger } from 'e2b'
import { template } from './template'

async function main() {
  await Template.build(template, {
    alias: 'e2b-with-docker',
    onBuildLogs: defaultBuildLogger(),
  });
}

main().catch(console.error);