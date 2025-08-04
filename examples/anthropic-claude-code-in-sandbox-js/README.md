# Anthropic Claude Code in E2B Sandbox (JavaScript)

This example shows how to run Anthropic's [Claude Code](https://github.com/anthropics/claude-code) in E2B Sandbox.

## How to create sandbox with Claude

We prepared a sandbox template with Claude Code already installed. You can create a sandbox with Claude Code by running the following code:

```javascript
import { Sandbox } from 'e2b'

const sbx = await Sandbox.create("anthropic-claude-code", {
  timeoutMs: 60 * 5 * 1000,
  envs: {
    // You can get your API key from Anthropic Console.
    ANTHROPIC_API_KEY: '<your api key>',
  },
}) // Timeout set to 5 minutes, you can customize it as needed.

// Run a prompt with Claude Code
const result = await sbx.commands.run(
  `echo 'Create a hello world index.html' | claude -p --dangerously-skip-permissions`,
  { timeoutMs: 0 } // Claude Code can run for a long time, so we need to set the timeoutMs to 0.
)
console.log(result.stdout)
```

---

## How to run example

**1. Set up E2B_API_KEY environment variable in `.env` file.**

**2. Replace `<your api key>` in the code with your actual Anthropic API key.**

**3. Install dependencies**
`npm install`

**4. Run the script**
`npm run start`
