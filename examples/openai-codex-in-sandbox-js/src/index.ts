import { Sandbox } from 'e2b'
import dotenv from 'dotenv'

dotenv.config()

const templateName = 'openai-codex'
const sbx = await Sandbox.create(templateName, {
  envs: {
    OPENAI_API_KEY: '<your api key>',
  },
})

console.log('Sandbox created', sbx.sandboxId)

// Print help for Codex
// const result = await sbx.commands.run('codex --help')
// console.log(result.stdout)

// Run a prompt with Codex
const result = await sbx.commands.run(
  `codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox "Create a hello world index.html"`,
  { timeoutMs: 0 }
)

console.log(result.stdout)

sbx.kill()
