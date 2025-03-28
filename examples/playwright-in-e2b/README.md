# How to run Playwright in E2B

This example [sandbox template](https://e2b.dev/docs/sandbox-template) shows how to run Playwright inside an E2B sandbox.

## Test out the premade sandbox

The sandbox template from this example is public and ready to be used. The template ID is `playwright-chromium`.

**E2B CLI**
```bash
e2b sandbox spawn playwright-chromium
```
You'll SSH into the sandbox and then run the following command to start a Playwright script:
```bash
# Important: Scripts must run from the /app directory
cd /app
PLAYWRIGHT_BROWSERS_PATH=0 node my-script.js
```

> [!IMPORTANT]
> All Playwright scripts must be run from the `/app` directory, as this is where the Playwright browsers are installed and configured. Always specify the `/app` directory as the current working directory when running commands.

> [!IMPORTANT]
> The environment variable `PLAYWRIGHT_BROWSERS_PATH=0` is critical when running Playwright scripts. This tells Playwright to look for browser binaries in the current Node.js project directory rather than in the user's home directory, which is the default behavior. Without this variable, Playwright won't find the pre-installed browsers.

**E2B JavaScript SDK**

Check out the [JavaScript example](./js/index.ts).
```js
import { Sandbox } from 'e2b'
const sbx = await Sandbox.create('playwright-chromium')

// Run the command verifying that Playwright is installed
const result = await sbx.commands.run('npx playwright --version', {
  cwd: '/app' // Important: Commands must run from the /app directory
})
console.log(result.stdout)

await sbx.kill()
```

## How to build your own sandbox that supports running Playwright

1. Run `npm i -g @e2b/cli@latest` to install the latest version of the E2B CLI.
2. Run `e2b template init` in your project directory.
3. Copy the [e2b.Dockerfile](./template/e2b.Dockerfile) into your project.
4. Run `e2b template build` to build your sandbox.
5. Start the sandbox either via our SDK or the E2B CLI like this `e2b sandbox spawn <sandbox-template-id>`.

> [!WARNING]
> This template only works with the `node:20-slim` base image as shown in the Dockerfile. It is not compatible with the `e2bdev/code-interpreter` base image due to specific dependencies required for Playwright.

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

3. Install dependencies and run the example:
   ```bash
   npm install
   npm run start
   ```

The example will:
- Create a new E2B sandbox with Playwright pre-installed
- Run a script that takes a screenshot of the Playwright website
- Download the screenshot to your local machine
- Clean up the sandbox

You can find the complete example code in the `app.ts` file.