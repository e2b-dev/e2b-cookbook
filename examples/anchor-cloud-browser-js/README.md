# Anchor cloud browser in an E2B sandbox

This example runs your code in an [E2B](https://e2b.dev) sandbox and connects it to an [Anchor](https://anchorbrowser.io) cloud browser. The sandbox stays the code runtime. Chromium runs as a managed Anchor session, and the sandbox talks to it over HTTPS and CDP.

> The sandbox receives your Anchor API key as an environment variable. Code running in the sandbox can read it. See [Why this example uses an environment variable](#why-this-example-uses-an-environment-variable).

## What it does

1. Creates an E2B sandbox with `ANCHOR_API_KEY` and `ANCHORBROWSER_API_KEY`.
2. Installs `anchorbrowser` in `/home/user/anchor`. Chromium is not downloaded into the sandbox.
3. Creates one Anchor session, prints its live view URL, and runs `agentTask` against [example.com](https://example.com).
4. Deletes the Anchor session, then deletes the sandbox.

Open the live view URL while the task runs to watch the remote browser. That stream is the Anchor session, not a desktop inside the sandbox.

`cdp_url` contains the API key in its query string. The script never prints it. Closing Playwright only disconnects from the session, so the script calls `Sessions.deleteSession` before it exits. If the process dies first, the session timeouts still end it (`max_duration` 30 minutes, `idle_timeout` 10 minutes). See [Session Timeout](https://docs.anchorbrowser.io/advanced/session-timeout).

## Setup

1. Copy the environment template and add your keys:

   ```bash
   cp .env.template .env
   ```

   - [E2B API key](https://e2b.dev/dashboard)
   - [Anchor API key](https://app.anchorbrowser.io)

   Anchor bills browser usage on your key. E2B does not meter it. The SDK reads `ANCHORBROWSER_API_KEY`. The example aliases that name from `ANCHOR_API_KEY` inside the sandbox. Without the alias, session and task calls return 401 even when `ANCHOR_API_KEY` is set.

2. Install dependencies and run the example:

   ```bash
   npm install
   npm start
   ```

You should see a live view URL, then a line like `Result: Example Domain`.

## Why this example uses an environment variable

[E2B Secrets](https://docs.e2b.dev/secrets) inject a stored value into HTTPS request headers at the egress proxy. The value never enters the sandbox environment. That covers an `anchor-api-key` header on `api.anchorbrowser.io`.

This example still needs the raw key inside the sandbox. `agentTask` connects over CDP, and that URL carries the API key in the query string. Secrets do not rewrite query strings or WebSocket URLs, so a secret reference cannot authenticate the browser connection.

Use a secret when the sandbox only calls Anchor's HTTPS API with the key in a header. Use the environment variable shown here when the sandbox connects over CDP.

## Egress

If the sandbox restricts outbound traffic, allow:

- `https://api.anchorbrowser.io`
- `wss://connect.anchorbrowser.io`
- `https://live.anchorbrowser.io`

## Optional: full Playwright control

`playwright-core` is only required when you drive the session yourself. `agentTask` is the path this example runs. To connect with Playwright instead, install `playwright-core` in the sandbox app and replace the body of `sandbox/browse.ts` with:

```typescript
import { chromium } from 'playwright-core'
import { client, Sessions } from 'anchorbrowser'

client.setConfig({ auth: () => process.env.ANCHORBROWSER_API_KEY })

const session = await Sessions.createSession({
  body: {
    session: {
      timeout: { max_duration: 30, idle_timeout: 10 },
    },
  },
})

const sessionId = session.data?.id
if (!sessionId) {
  throw new Error('Anchor session did not return an id')
}

if (session.data?.live_view_url) {
  console.log(`Live view: ${session.data.live_view_url}`)
}

let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
try {
  browser = await chromium.connectOverCDP(session.data.cdp_url)
  const page = browser.contexts()[0].pages()[0] ?? (await browser.newPage())
  await page.goto('https://example.com')
  console.log('Title:', await page.title())
} finally {
  try {
    await browser?.close()
  } catch (error) {
    console.error('Failed to close browser:', error)
  }
  try {
    await Sessions.deleteSession({ path: { session_id: sessionId } })
  } catch (error) {
    console.error('Failed to delete Anchor session:', error)
  }
}
```

## Python equivalent

The same contract works from Python inside the sandbox. Install with `pip install "anchorbrowser>=1.0"` and add `playwright` only for direct CDP control.

```python
import os
from anchorbrowser import Anchorbrowser

anchor_client = Anchorbrowser(api_key=os.getenv("ANCHORBROWSER_API_KEY"))
result = anchor_client.agent.task("Go to example.com and return the page title")
print(result.data.result)
```

## References

- [Anchor sandboxes overview](https://docs.anchorbrowser.io/integrations/sandboxes)
- [Create a Session](https://docs.anchorbrowser.io/quickstart/create-session)
- [Perform Web Task](https://docs.anchorbrowser.io/agentic-browser-control/ai-task-completion)
- [E2B environment variables](https://docs.e2b.dev/sandbox/environment-variables)
- [E2B Secrets](https://docs.e2b.dev/secrets)
