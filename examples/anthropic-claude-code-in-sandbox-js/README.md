# Anthropic Claude Code in E2B Sandbox (JavaScript)

This example shows how to run Anthropic's [Claude Code](https://github.com/anthropics/claude-code) in E2B Sandbox.

## How to create sandbox with Claude Code

We prepared a sandbox template with Claude Code already installed. You can create a sandbox with Claude Code by running the following code:

```javascript
import 'dotenv/config' // loads E2B_API_KEY and ANTHROPIC_API_KEY from .env
import { Sandbox } from 'e2b'

const sbx = await Sandbox.create("claude", {
  timeoutMs: 60 * 5 * 1000,
  envs: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
}) // Timeout set to 5 minutes, you can customize it as needed.

try {
  // Run a prompt with Claude Code
  const result = await sbx.commands.run(
    `echo 'Create a hello world index.html' | claude -p --dangerously-skip-permissions`,
    { cwd: "/home/user", timeoutMs: 0 } // Claude Code can run for a long time, so we need to set the timeoutMs to 0.
  )
  console.log(result.stdout)
} finally {
  // Kill the sandbox even when the run fails.
  await sbx.kill()
}
```

The snippet uses `import` and top-level `await`, so run it as an ES module (`"type": "module"` in `package.json`, as in this example).

---

## How to run example

**1. Set `E2B_API_KEY` and `ANTHROPIC_API_KEY` in a `.env` file.**

**2. Install dependencies**
`npm install`

**3. Run the script**
`npm run start`
