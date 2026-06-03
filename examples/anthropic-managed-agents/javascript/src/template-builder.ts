import { Template, defaultBuildLogger } from "e2b";

import { DEFAULT_BUILD_TEMPLATE_NAME } from "./constants.js";
import { template } from "./template.js";

export async function buildTemplate(templateName = DEFAULT_BUILD_TEMPLATE_NAME) {
  await Template.build(template, templateName, {
    cpuCount: 1,
    memoryMB: 1024,
    onBuildLogs: defaultBuildLogger(),
  });
  return { name: templateName };
}
