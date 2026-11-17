# OpenAI Codex in E2B Sandbox (JavaScript)

This example shows how to run OpenAI's [Codex](https://github.com/openai/codex) in E2B Sandbox.

## How to create sandbox with Codex
We prepared a sandbox template with Codex already installed. You can create a sandbox with Codex by running the following code:

```javascript
import 'dotenv/config' // loads E2B_API_KEY and CODEX_API_KEY from .env
import { Sandbox } from 'e2b'

const sbx = await Sandbox.create('codex', {
  envs: {
    // Codex reads an OpenAI API key from CODEX_API_KEY.
    CODEX_API_KEY: process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY,
  },
})

// Print help for Codex
// const result = await sbx.commands.run('codex --help')
// console.log(result.stdout)

// Run a prompt with Codex
const result = await sbx.commands.run(
  `codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox "Create a hello world index.html"`,
  { timeoutMs: 0 } // Codex can run for a long time, so we need to set the timeoutMs to 0.
)

console.log(result.stdout)

await sbx.kill()
```

The snippet uses `import` and top-level `await`, so run it as an ES module (`"type": "module"` in `package.json`, as in this example).

---

## How to run example

**1. Set `E2B_API_KEY` and `CODEX_API_KEY` (an OpenAI API key) in a `.env` file.** `OPENAI_API_KEY` works too.

**2. Install dependencies**
`npm install`

**3. Run the script**
`npm run start`
