import { Template, defaultBuildLogger } from "e2b";
import "dotenv/config";
import { template } from "./template";

async function main() {
  await Template.build(template, {
    alias: "e2b-with-docker-dev",
    onBuildLogs: defaultBuildLogger(),
  });
}

main().catch(console.error);
