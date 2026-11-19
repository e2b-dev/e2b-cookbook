// npm run build-template: build the sandbox template from the Box Mount package dropped into private/.
import { readdirSync } from "node:fs";
import { Template, defaultBuildLogger } from "e2b";
import { PRIVATE_DIR, loadEnv } from "./config.ts";
import { TEMPLATE_NAME, boxMountTemplate } from "./template.ts";

loadEnv();
if (!readdirSync(PRIVATE_DIR).some((name) => name !== "README.md")) {
  throw new Error(
    "Put the Box Mount Linux binary (or the archive Box sent you) in private/ first. Request preview access at https://developer.box.com/guides/box-mount",
  );
}

const info = await Template.build(boxMountTemplate(), TEMPLATE_NAME, {
  cpuCount: 2,
  memoryMB: 2048,
  onBuildLogs: defaultBuildLogger(),
});
console.log(`\nBuilt template ${TEMPLATE_NAME} (${info.templateId}). Next: npm run doctor, then npm start`);
