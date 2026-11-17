import dotenv from "dotenv";
import { Sandbox } from "e2b";

dotenv.config();

// The prebuilt "claude" template ships a current Claude Code.
// template.ts and the build scripts are only needed for a custom template.
const sbx = await Sandbox.create("claude", {
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
  { cwd: "/home/user", timeoutMs: 0 }, // Claude Code can run for a long time, so we need to set the timeoutMs to 0.
);

console.log(result.stdout);

await sbx.kill();
