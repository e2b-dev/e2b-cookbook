import "dotenv/config";
import { template, templateName } from "./template";
import { Template } from "e2b";


Template.build(template, {
  alias: templateName,
  cpuCount: 1,
  memoryMB: 1024,
  onBuildLogs: (logEntry) => console.log(logEntry.toString()),
});