import "dotenv/config";
import { Template, defaultBuildLogger } from "e2b";
import { template, templateName } from "./template";

async function main() {
  await Template.build(template, {
    alias: `${templateName}-dev`,
    cpuCount: 1,
    memoryMB: 1024,
    onBuildLogs: defaultBuildLogger(),
  });
}

main().catch(console.error);
