# Live Browser Feed for Playwright Tests in E2B

Run a headed Playwright test inside an E2B sandbox and watch the browser
drive itself in real time from any browser tab. No screen-sharing
software, no separate desktop, no recording — just a `https://` URL the
sandbox publishes that streams the test as it runs.

Battle-tested at [qualitymax.io](https://qualitymax.io): this is the
same stack that powers the platform's "Live" tab in the execution view,
trimmed to the smallest reproducible cookbook example.

## What it shows

- Boot `Xvfb + x11vnc + websockify + noVNC` inside a fresh
  `playwright-chromium` sandbox.
- Get the publicly-reachable noVNC URL from `sandbox.getHost(6080)`.
- Run a headed Playwright test against `DISPLAY=:99` so x11vnc captures
  the rendered surface.
- Optionally hold the sandbox alive *after* the run so the browser tab
  can still display the final page state (or the broken state when a
  test fails).

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         E2B sandbox                                  │
│                                                                      │
│  Xvfb :99 (1280x720x24)  ◀─ DISPLAY=:99 ─  Playwright + Chromium     │
│       │                                                              │
│       ▼                                                              │
│  x11vnc → RFB on :5900                                               │
│       │                                                              │
│       ▼                                                              │
│  websockify → :6080  (also serves noVNC client from /usr/share/novnc)│
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │  https://<getHost(6080)>/vnc.html
                                  │
                            Your browser tab
```

A single port (`6080`) does two jobs: it serves the noVNC HTML/JS client
*and* it's the WebSocket endpoint the client connects to for the VNC
stream. E2B routes `https://<getHost(6080)>/*` to it transparently. TLS
is terminated at E2B's edge, so the URL is always `https://` — plain
`http://` to a `getHost` URL produces a connection error.

## Setup

```bash
npm install
cp .env.template .env    # then fill in E2B_API_KEY
npm run typecheck        # sanity check
npm run example:watch    # watch a passing test live
npm run example:hold     # see the pause-on-failure pattern
```

## Examples

| Script | What it shows |
| --- | --- |
| `examples/01-watch-live-test.ts` | Run a passing test against `playwright.dev` while you watch in the noVNC tab. Holds the sandbox for 60s after the run so you can confirm the final state. |
| `examples/02-hold-on-failure.ts` | Deliberately failing test that demonstrates the pause-on-failure pattern: when the test errors out, the sandbox stays alive long enough for you to reload the noVNC URL and see what the page actually looked like at failure. |

## How it works

### 1. Boot the VNC stack

`src/vnc-setup.ts` runs a single bash blob inside the freshly-created
sandbox that:

- `apt-get install -y x11vnc novnc websockify` (only if missing — the
  `playwright-chromium` template doesn't ship them by default).
- `Xvfb :99 -screen 0 1280x720x24 &` — a virtual X server for Chromium
  to render into.
- `x11vnc -display :99 -rfbport 5900 -bg` — captures the framebuffer
  and serves it as RFB on port 5900.
- `websockify --web=/usr/share/novnc 6080 localhost:5900 &` — wraps the
  RFB stream as WebSocket on port 6080 *and* serves the noVNC HTML
  client from the same port.

All four daemons inherit the sandbox's lifetime; killing the sandbox
tears them down. Logs go to `/tmp/vnc-*.log` for debugging if the
noVNC tab refuses to connect.

### 2. Drive a headed Playwright test

`src/runner.ts` writes the test file and a Playwright config into
`/home/user/work`, then runs:

```
DISPLAY=:99 PLAYWRIGHT_BROWSERS_PATH=... npx playwright test
```

The config sets `headless: false` and `slowMo: 250` so the human
watching the noVNC tab actually has time to see the actions land. Two
non-obvious settings:

- `viewport: { width: 1280, height: 720 }` matches the Xvfb screen
  size. Mismatched sizes cause Chromium to scroll the rendered surface
  inside the framebuffer.
- `launchOptions.env = { DISPLAY: ':99' }` is belt-and-braces — the
  shell env already exports DISPLAY, but Playwright reads `process.env`
  at browser launch and the SDK's command runner doesn't always
  propagate inherited env. Without this, Chromium can launch against
  the wrong display and you see a blank noVNC tab.

### 3. Hold the sandbox after the run

`POST_RUN_HOLD_SECONDS` keeps the sandbox alive after the test finishes
or fails. This matters because the moment you call `sandbox.kill()`,
websockify dies and the noVNC tab goes 502. Without a hold, the live
view disappears at exactly the moment a human would want to inspect it.

`examples/02-hold-on-failure.ts` shows the failure variant: when the
test fails, keep the sandbox up so the operator can reload the noVNC
URL and visually diagnose what went wrong with the page.

## Adapting it

- **Pre-bake the VNC stack into your own template** to drop the cold-start
  cost of the `apt-get install` step (saves ~5-10s on first run per
  fresh sandbox). Build an E2B template based on `playwright-chromium`
  with `x11vnc`, `novnc`, `websockify` already installed and the
  `Xvfb/x11vnc/websockify` daemons supervised by systemd or `tini`.
- **Plug it into the self-healing example** (`../self-healing-playwright-tests`).
  The healer's failure-snapshot loop and the live VNC feed are
  complementary: the snapshot tells the LLM what the DOM was at
  failure, the VNC feed tells the human watching what the *page*
  looked like.
- **Embed the noVNC URL in your UI.** It's just a `<iframe src=…>` —
  the noVNC client is plain HTML/JS served from inside the sandbox.
  This is exactly how the qualitymax.io execution-view "Live" tab is
  built.
- **Tighten the hold window.** A long hold is a real cost (sandbox
  uptime is billed). Tier it: hold longer for failed runs (the operator
  wants to inspect), shorter for successful ones.

## Caveats

- **Audio is not captured.** x11vnc forwards X11 only. If your tests
  rely on audio you'll need to route PulseAudio over the same WebSocket
  or use a different streaming layer (e.g. GStreamer).
- **Bandwidth.** The noVNC stream is full-framebuffer; ~1280x720 at the
  rates Playwright drives runs cheap, but parallel streams to many tabs
  add up. For agent fleets running many tests in parallel, prefer the
  self-healing snapshot pattern and use the live feed only for the
  ones a human is actively watching.
- **First-run install latency.** ~5-10s for `apt-get install x11vnc novnc
  websockify` on a cold sandbox. Pre-bake into a custom template to
  remove this from the critical path.

## Credits

- VNC pattern inspired by [qualitymax.io](https://qualitymax.io)'s
  execution-view live tab.
- Sandbox runtime: [E2B](https://e2b.dev).
- noVNC: <https://novnc.com>.
