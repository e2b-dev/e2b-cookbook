# Browser Use cloud browser with E2B

This example serves a small web app from an E2B sandbox and tests it with a
[Browser Use](https://browser-use.com) cloud browser. It is the pattern for
agents that build or run code in a sandbox and then need a real browser to check
the result.

The browser runs on Browser Use Cloud, not inside the sandbox, so the sandbox
needs no Chromium install. The script:

1. Creates an E2B sandbox, writes a to-do app into it and serves it on port 8000.
2. Exposes the app on the sandbox's public URL with `sandbox.get_host(8000)`.
3. Creates a Browser Use cloud browser with `client.browsers.create()` and prints
   its live view URL.
4. Connects Playwright to the browser over CDP, reads the to-do list, adds a
   to-do, checks that the page shows 3 to-dos and saves a screenshot to
   `output/app.png`.
5. Stops the browser with `client.browsers.stop()` and kills the sandbox.

Closing the Playwright connection does not stop a Browser Use browser, so the
script stops it in a `finally` block. If the process dies first, the browser
stops on its own after `BROWSER_TIMEOUT_MINUTES` (10 minutes).

## Setup and run

### 1. Install dependencies

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) and run:

```bash
uv sync
```

Playwright only connects to the remote browser, so there is no need to run
`playwright install`.

### 2. Configure API keys

```bash
cp .env.template .env
```

Fill in `E2B_API_KEY` from the [E2B dashboard](https://e2b.dev/dashboard?tab=keys)
and `BROWSER_USE_API_KEY` from
[Browser Use Cloud](https://cloud.browser-use.com/settings?tab=api-keys). Browser
Use bills browser time on this key, see [pricing](https://browser-use.com/pricing).

### 3. Run

```bash
uv run main.py
```

Open the printed live view URL to watch the browser while the script runs.

## Using your own app

Replace `APP_HTML` and `start_app()` with whatever runs in your sandbox. Any
server listening on a sandbox port is reachable at
`https://{sandbox.get_host(port)}`, so the browser code does not change.

## Driving the browser from inside the sandbox

An agent running in the sandbox can use the same browser. Pass the key into the
sandbox with `Sandbox.create(envs={"BROWSER_USE_API_KEY": ...})`, then either run
the same `browsers.create()` / `browsers.stop()` code there, or connect any CDP
client straight to:

```
wss://connect.browser-use.com?apiKey=<BROWSER_USE_API_KEY>&timeout=10
```

Code in the sandbox can read the key, and the CDP URL carries it in the query
string, so do not log that URL.

## Learn more

- [Browser Use cloud browser quickstart](https://docs.browser-use.com/cloud/browser/quickstart)
- [Browser Use Python SDK](https://pypi.org/project/browser-use-sdk/)
- [E2B sandbox internet access](https://e2b.dev/docs/sandbox/internet-access)
