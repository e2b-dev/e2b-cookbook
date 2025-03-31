# How to run Playwright in E2B

This example [sandbox template](https://e2b.dev/docs/sandbox-template) shows how to run Playwright inside an E2B sandbox.

## Usage Example

This project contains a ready-to-use example of running Playwright in an E2B sandbox.

### Setup

1. Copy the environment variables file and add your API keys:
   ```bash
   cp example.env .env
   ```

2. Edit the `.env` file and add your API keys:
   ```
   # Fill in your E2B API key and OpenAI API key here
   # You can get your E2B API key from https://e2b.dev/dashboard
   # You can get your OpenAI API key from https://platform.openai.com/account/api-keys
   E2B_API_KEY=your_e2b_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. Edit the `script.mjs` file to contain your Playwright script:

   ```javascript
   import { chromium } from 'playwright'

   const browser = await chromium.launch()
   const context = await browser.newContext()
   const page = await context.newPage()

   await page.goto('https://playwright.dev/');
   await page.screenshot({ path: '/home/user/example.png' });

   await browser.close()

   console.log('done')
   ```

4. Install dependencies and run the example:
   ```bash
   npm install
   npm run start
   ```

The example will:
- Create a new E2B sandbox with Playwright pre-installed
- Run the Playwright script
- Copy output files to the `output` directory
- Clean up the sandbox

You can find the complete example code in the `app.ts` file.

##  E2B JavaScript SDK

To run Playwright scripts via the E2B SDK:

```js
import { Sandbox } from 'e2b'
const sbx = await Sandbox.create('playwright-chromium')

// Run the command verifying that Playwright is installed
const result = await sbx.commands.run('PLAYWRIGHT_BROWSERS_PATH=0 npx playwright --version', {
  cwd: '/app' // Important: Commands must run from the /app directory
})
console.log(result.stdout)

await sbx.kill()
```

> [!IMPORTANT]
> All Playwright scripts must be run from the `/app` directory, as this is where the Playwright browsers are installed and configured.

> [!IMPORTANT]
> The environment variable `PLAYWRIGHT_BROWSERS_PATH=0` is necessary to tell Playwright to look for browser binaries in the current Node.js project directory.

## How to build your own sandbox that supports running Playwright

1. Run `npm i -g @e2b/cli@latest` to install the latest version of the E2B CLI.
2. Run `e2b template init` in your project directory.
3. Copy the [e2b.Dockerfile](./template/e2b.Dockerfile) into your project.
4. Run `e2b template build` to build your sandbox.
5. Start the sandbox either via our SDK or the E2B CLI like this `e2b sandbox spawn <sandbox-template-id>`.

> [!WARNING]
> This template only works with the `node:20-slim` base image as shown in the Dockerfile. It is not compatible with the `e2bdev/code-interpreter` base image due to specific dependencies required for Playwright.