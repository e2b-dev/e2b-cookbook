import { Sandbox } from 'e2b'
import dotenv from 'dotenv'

dotenv.config()

// The prebuilt "codex" template ships a current Codex CLI.
const templateName = 'codex'
const sbx = await Sandbox.create(templateName, {
  envs: {
    // Codex reads an OpenAI API key from CODEX_API_KEY.
    CODEX_API_KEY: process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY || '',
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
