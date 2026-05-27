import fs from 'fs'
import "dotenv/config";
import { Sandbox } from "e2b";
import { templateName } from "./template";

const sbx = await Sandbox.create(templateName, {
  envs: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
});

console.log("Sandbox created", sbx.sandboxId);

// Print help for Claude Code
// const result = await sbx.commands.run('claude --help')
// console.log(result.stdout)

// Run a prompt with Claude Code
const result = await sbx.commands.run(
  `echo 'Create a hello world index.html' | claude -p --dangerously-skip-permissions`,
  { timeoutMs: 0 }, // Claude Code can run for a long time, so we need to set the timeoutMs to 0.
);

console.log(result.stdout);

const content = await sbx.files.read('/home/user/index.html')
// Write file to local filesystem
fs.writeFileSync('./index.html', content)

await sbx.kill();
