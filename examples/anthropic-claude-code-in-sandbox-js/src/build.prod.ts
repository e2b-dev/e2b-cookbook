import "dotenv/config";
import { defaultBuildLogger, Template } from "e2b";
import { template, templateName } from "./template";

Template.build(template, {
  alias: templateName,
  cpuCount: 1,
  memoryMB: 1024,
  onBuildLogs: defaultBuildLogger(),
});
