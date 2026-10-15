# Pi with its tools in an E2B sandbox (JavaScript)

[Pi](https://pi.dev) runs on your machine; its tools run in an [E2B](https://e2b.dev) sandbox. The [`@e2b/pi`](https://github.com/e2b-dev/pi-extension) extension gives Pi a `--e2b` flag: the agent works on a copy of your project in a sandbox, can't touch your files, processes or credentials, and you bring its changes back with `/e2b pull`.

This example drives that flow from a script with Pi's SDK, so you can run it with one command and read every step in your terminal:

1. **Start.** A fresh git checkout, `sandbox-roasters`, is created on your machine. The sandbox starts with the first prompt and gets a copy of the working tree.
2. **Work.** Pi builds a one-page site for a coffee roaster. `bash`, `read`, `write` and `edit` run in the sandbox; `preview_url` turns port 8080 into a public `https://8080-<sandbox>.e2b.app` link.
3. **Pull.** `/e2b pull` shows the diff stat and applies it to your checkout. `git status` then shows `index.html` on your machine.

```
  E2B × Pi  @e2b/pi
  ────────────────────────────────────────────────────────────
  Task      Build a one-page site for Sandbox Roasters, a small coffee roaster: ...
  Project   /tmp/pi-e2b-2KlBlj/sandbox-roasters
  Model     anthropic/claude-sonnet-5-5

  ◆ E2B sandbox igjk3mmyvz8u15tikweg1 created in 0.7s
    └  1.0s  project uploaded: your git working tree, unpacked and committed as the baseline
  ● preview_url  port=8080
    └  0.0s  https://8080-igjk3mmyvz8u15tikweg1.e2b.app
  ● write  index.html  3,902 chars
    └  0.7s  Successfully wrote to /home/user/sandbox-roasters/index.html
  ● bash  cd /home/user/sandbox-roasters && (nohup python3 -m http.server 8080 --bind 0.0.0.0 ...
    └  1.5s  200

  Pi

  The Sandbox Roasters site is up on port 8080: https://8080-igjk3mmyvz8u15tikweg1.e2b.app
  ...

  Pull changes
  Apply to /tmp/pi-e2b-2KlBlj/sandbox-roasters?

  index.html | 78 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   1 file changed, 78 insertions(+)
  → Yes (answered by the script)

  ◆ Pulled. Review with git diff.

  sandbox-roasters ❯ ls && git status --short
  index.html
  README.md
  ?? index.html

  ✓ Done in 21s · 3 tool calls
```

## How to run the example

**1. Set the API keys**

Copy `.env.example` to `.env` and fill in `E2B_API_KEY` and `ANTHROPIC_API_KEY`.

**2. Install dependencies** (Node 22.19 or newer)

```bash
npm install
```

**3. Run the script**

```bash
npm start                                   # the Sandbox Roasters site
npm start -- "Write a FastAPI hello world, run it on port 8000 and share the link"   # your own task
```

In a terminal the script waits for Enter before it kills the sandbox, so you can open the preview URL. Piped or in CI it kills it at once.

## How it works

[`src/index.ts`](src/index.ts) is what `cd sandbox-roasters && pi --e2b` does, in SDK calls:

| CLI | SDK |
| --- | --- |
| `pi install npm:@e2b/pi` | `new DefaultResourceLoader({ additionalExtensionPaths: [<@e2b/pi>] })` |
| `pi --e2b` | `session.extensionRunner.setFlagValue('e2b', true)`, then `session.bindExtensions(...)` fires `session_start` and the extension swaps in its sandbox tools |
| typing the task | `session.prompt(task)` |
| `/e2b pull`, answering Yes | `session.prompt('/e2b pull')`, with a UI context whose `confirm` returns `true` |
| `/e2b kill` | `session.prompt('/e2b kill')` |

The session is in memory, like `pi --no-session`, so the sandbox is created to be killed rather than paused. [`src/tui.ts`](src/tui.ts) only prints: the tool call trace, Pi's answer and the extension's dialogs.

## Use it interactively

The everyday way to use the extension is Pi's own TUI, which is what the recording above shows:

```bash
npm install -g @earendil-works/pi-coding-agent
pi install npm:@e2b/pi
cd my-project
pi --e2b
```

`/e2b` shows the sandbox and what is not pulled yet, `/e2b pull --branch` commits the changes on a local `pi/<session>` branch instead, and `pi --e2b -c` resumes the same sandbox later. See the [extension README](https://github.com/e2b-dev/pi-extension#readme) for all flags and commands.
