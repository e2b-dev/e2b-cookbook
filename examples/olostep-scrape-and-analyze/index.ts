import "dotenv/config";
import fs from "fs";
import { Sandbox } from "@e2b/code-interpreter";
import { scrapeMarkdown } from "./scraping";

const main = async () => {
  console.log("Scraping with Olostep...");
  const md = await scrapeMarkdown("https://news.ycombinator.com/jobs");
  console.log(`Got ${md.length} chars of markdown`);

  const sandbox = await Sandbox.create();
  await sandbox.files.write("/home/user/page.md", md);

  const code = fs.readFileSync("analyze.py", "utf-8").replace(/^\uFEFF/, "");
  const execution = await sandbox.runCode(code);

  console.log(execution.logs.stdout.join("\n"));
  if (execution.logs.stderr.length) console.error(execution.logs.stderr.join("\n"));
  if (execution.error) console.error(execution.error);

  const chart = execution.results[0]?.png;
  if (chart) {
    fs.writeFileSync("chart.png", Buffer.from(chart, "base64"));
    console.log("Saved chart.png");
  } else {
    console.log("No chart returned");
  }

  await sandbox.kill();
};

main();