# BrowseCLI in an E2B sandbox

Run the Browserbase [`browse`](https://github.com/browserbase/stagehand/tree/main/packages/cli)
CLI **inside an [E2B](https://e2b.dev) sandbox** to reach any site through a
**Verified Browserbase browser** over CDP — residential IP (no datacenter-IP
blocking), Verified browser mode (passes bot detection), and automatic
server-side CAPTCHA solving.

The agent loop runs **in the sandbox**; the browser runs **on Browserbase**.

```
┌──────────────────────────┐        CDP over wss         ┌──────────────────────────┐
│  E2B sandbox (Firecracker)│ ──────────────────────────▶ │  Browserbase Verified     │
│  node + `browse` CLI      │                              │  browser (residential IP, │
│  your agent loop          │ ◀──────────────────────────│  stealth, CAPTCHA solve)   │
└──────────────────────────┘        page data / refs      └──────────────────────────┘
```

## Why this recipe (vs what E2B already ships)

E2B already has two browser stories in the cookbook:

- **[`mcp-browserbase-js`](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/mcp-browserbase-js)** —
  runs Browserbase as an **MCP server** inside the sandbox and points an OpenAI
  agent at it through E2B's MCP gateway. Great for "give a model a browser tool,"
  but it's an MCP-gateway pattern, not a CLI you script.
- A **Kernel-backed browser** template — an in-sandbox browser primitive.

This example fills the slot Kernel occupies, but with **anti-bot as the headline**:
a vanilla Firecracker/OCI sandbox browser has a **datacenter IP** (instantly
blocked by Cloudflare/Akamai/DataDome), no fingerprint hardening, and no CAPTCHA
solving. Here the browser never runs in the sandbox at all — the sandbox runs the
`browse` CLI (or your agent loop) and connects out over CDP to a **Verified
Browserbase browser** that uses a residential IP, passes bot detection, and
solves challenges server-side. Same isolation guarantees from E2B; a browser that
can actually reach protected production sites.

| | This recipe | In-sandbox Chrome / Kernel | `mcp-browserbase-js` |
| --- | --- | --- | --- |
| Where the browser runs | Browserbase (remote) | Inside the sandbox | Browserbase (via MCP) |
| Egress IP | Residential / Verified | Datacenter (blocked) | Residential / Verified |
| Bot-detection fingerprint | Hardened (Verified mode) | Raw headless | Hardened |
| CAPTCHA / challenge solving | Automatic, server-side | None | Automatic |
| How you drive it | `browse` CLI / your loop | CDP / Playwright | MCP tool calls from a model |

## Files

| File | Purpose |
| --- | --- |
| `e2b.Dockerfile` | The template image: `node:20-slim` + `npm i -g browse`. **No Chrome.** |
| `e2b.toml` | E2B template config (`template_name`, `dockerfile`, `start_cmd`, resources). |
| `browsecli-demo.sh` | The demo: create a Verified session → open a Cloudflare-protected page over CDP → assert real content. |
| `index.ts` | TS runner — `Sandbox.create({ template })`, uploads + runs the demo via `sbx.commands.run`. |
| `main.py` | Python runner — same flow with the Python SDK. |
| `package.json` | Deps for the TS runner (`e2b`, `tsx`, `dotenv`). |
| `env.template` | `E2B_API_KEY`, `BROWSERBASE_API_KEY`. |

> **Note:** Verified browsers/sessions (residential IP + automatic CAPTCHA solving) require a Browserbase **Scale** plan — see https://www.browserbase.com/pricing and https://www.browserbase.com/verified. On lower plans, drop `--verified` (you'll get Basic stealth).

## Run it on E2B

```bash
cp env.template .env   # fill in E2B_API_KEY, BROWSERBASE_API_KEY
npm install

# 1) Build the template image from e2b.Dockerfile (one-time / on image change).
#    Requires the e2b CLI:  npm i -g @e2b/cli   (then `e2b auth login`)
npm run build:template        # == e2b template build  (reads e2b.toml)

# 2) Run the SDK script: creates a sandbox from the template and runs the demo.
npm start                     # == tsx index.ts
```

Python instead of TS:

```bash
pip install e2b python-dotenv
e2b template build
python main.py
```

Expected tail of output:

```
[browsecli-demo] RESULT: ✅ PASS — reached real content through the protected site from inside the sandbox
✅ Done — reached real content through a Verified Browserbase browser from inside E2B.
```

Override the target with `TARGET_URL=https://… npm start`.

### Local Docker-equivalent (no E2B account needed)

`e2b.Dockerfile` is a plain OCI image, so you can prove the BrowseCLI path end-to-end
with Docker before you ever build the E2B template:

```bash
docker build -t browsecli-sandbox:e2b -f e2b.Dockerfile .
docker run --rm \
  -e BROWSERBASE_API_KEY=$BROWSERBASE_API_KEY \
  browsecli-sandbox:e2b /app/browsecli-demo.sh
```

## Learn more

- [E2B Documentation](https://e2b.dev/docs)
- [Browserbase Documentation](https://docs.browserbase.com)
- [`browse` CLI](https://github.com/browserbase/stagehand/tree/main/packages/cli)
- [`mcp-browserbase-js`](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/mcp-browserbase-js) — the model-drives-a-browser-via-MCP companion to this CLI recipe
