# Notte cloud browser with E2B

This example serves a small web app from an E2B sandbox and tests it with a
[Notte](https://notte.cc) cloud browser. It is the pattern for agents that build
or run code in a sandbox and then need a real browser to check the result.

The browser runs on Notte, not inside the sandbox, so the sandbox needs no
Chromium install. The script:

1. Creates an E2B sandbox, writes a to-do app into it and serves it on port 8000.
2. Exposes the app on the sandbox's public URL with `sandbox.get_host(8000)`.
3. Starts a Notte browser session, prints its live viewer URL and uses
   `session.page`, a Playwright page connected over CDP, to read the to-do list
   and save a screenshot to `output/app.png`.
4. Installs the latest [Notte CLI](https://github.com/nottelabs/notte-cli) in the
   sandbox with `curl -fsSL https://notte.cc/install-cli.sh | sh`, plus the Notte
   skills in `~/.agents/skills`, where coding agents such as Claude Code and Codex
   pick them up.
5. Drives a second browser session from inside the sandbox with CLI commands:
   open the app, add a to-do, and scrape the page to confirm it shows 3 to-dos.
6. Stops both browser sessions and kills the sandbox.

The CLI commands in step 5 are the same ones a coding agent in the sandbox runs
once the skill is installed:

```bash
notte sessions start
notte page goto https://8000-<sandbox-id>.e2b.app
notte page fill '#title' 'Ship the E2B example'
notte page click 'button[type=submit]'
notte page scrape --only-main-content
notte sessions stop
```

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
and `NOTTE_API_KEY` from the [Notte console](https://console.notte.cc).

### 3. Run

```bash
uv run main.py
```

Open the printed viewer URLs to watch the browsers while the script runs.

## Using your own app

Replace `APP_HTML` and `start_app()` with whatever runs in your sandbox. Any
server listening on a sandbox port is reachable at
`https://{sandbox.get_host(port)}`, so the browser code does not change.

## Learn more

- [Connect Playwright to a Notte session](https://docs.notte.cc/features/sessions/playwright)
- [Notte CLI](https://github.com/nottelabs/notte-cli)
- [Notte skills](https://github.com/nottelabs/notte-skills)
- [E2B sandbox internet access](https://e2b.dev/docs/sandbox/internet-access)
