# OpenAI Codex in E2B Sandbox (JavaScript)

This example shows how to run OpenAI's [Codex](https://github.com/openai/codex) in E2B Sandbox.

## How to create sandbox with Codex
We prepared a sandbox template with Codex already installed. You can create a sandbox with Codex by running the following code:

```javascript
const { Sandbox } = require('e2b')

const sbx = await Sandbox.create('openai-codex', { timeoutMs: 60 * 5 * 1000 }) // Timeout set to 5 minutes, you can customize it as needed.
const result = await sbx.commands.run('codex --help')
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
