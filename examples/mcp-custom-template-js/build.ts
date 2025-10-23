import { Template } from "e2b";
import { template, alias } from "./template";

async function buildTemplate() {
  console.log('Building custom E2B template with pre-installed MCP servers...');
  
  await Template.build(template, {
    alias,
    cpuCount: 8,
    memoryMB: 8192,
    onBuildLogs: console.log,
  });

  console.log('Custom template built successfully');
  console.log(`Template alias: ${alias}`);
}

buildTemplate();
