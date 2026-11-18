import { Sandbox } from 'e2b'
import dotenv from 'dotenv'

dotenv.config()

// Codex reads an OpenAI API key from CODEX_API_KEY.
const apiKey = process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY
if (!apiKey) throw new Error('Set CODEX_API_KEY (an OpenAI API key) in .env')

// The prebuilt "codex" template ships a current Codex CLI.
const templateName = 'codex'
const sbx = await Sandbox.create(templateName, {
  envs: { CODEX_API_KEY: apiKey },
})

console.log('Sandbox created', sbx.sandboxId)

try {
  // Print help for Codex
  // const result = await sbx.commands.run('codex --help')
  // console.log(result.stdout)

  // Run a prompt with Codex
  const result = await sbx.commands.run(
    `codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox "Create a hello world index.html"`,
    { timeoutMs: 0 }
  )

  console.log(result.stdout)
} finally {
  // Kill the sandbox even when the run fails.
  await sbx.kill()
}
