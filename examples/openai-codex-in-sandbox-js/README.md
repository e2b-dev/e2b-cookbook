# OpenAI Codex in E2B Sandbox (JavaScript)

This example shows how to run OpenAI's [Codex](https://github.com/openai/codex) in E2B Sandbox.

## How to create sandbox with Codex
We prepared a sandbox template with Codex already installed. You can create a sandbox with Codex by running the following code:

```javascript
const { Sandbox } = require('e2b')

const sbx = await Sandbox.create('openai-codex', {
  envs: {
    // You can get your API key from OpenAI Console.
    OPENAI_API_KEY: '<your api key>',
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
```

---

## How to run example

**1. Create sandbox with Codex**
** 1. Set up E2B_API_KEY environment variable in `.env` file.**

**2. Install dependencies**
`npm install`

**3. Run the script**
`npm run start`
