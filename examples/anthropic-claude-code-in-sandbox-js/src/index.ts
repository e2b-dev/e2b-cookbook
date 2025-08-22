import dotenv from 'dotenv'
import { Sandbox } from 'e2b'

dotenv.config()

const templateName = 'anthropic-claude-code'

const sbx = await Sandbox.create(templateName, {
  envs: {
    ANTHROPIC_API_KEY: '<your api key>',
  },
})

console.log('Sandbox created', sbx.sandboxId)

// Print help for Claude Code
// const result = await sbx.commands.run('claude --help')
// console.log(result.stdout)

// Run a prompt with Claude Code
const result = await sbx.commands.run(
  `echo 'Create a hello world index.html' | claude -p --dangerously-skip-permissions`,
  { timeoutMs: 0 } // Claude Code can run for a long time, so we need to set the timeoutMs to 0.
)

console.log(result.stdout)

sbx.kill()
