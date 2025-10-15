import "dotenv/config";
import { Template, defaultBuildLogger } from "e2b";
import { template, templateName } from "./template";

Template.build(template, {
  alias: `${templateName}-dev`,
  cpuCount: 1,
  memoryMB: 1024,
  onBuildLogs: defaultBuildLogger(),
});
