# Contract review on Box files with Box Mount + E2B

This example mounts a Box folder inside an E2B sandbox with [Box Mount](https://developer.box.com/guides/box-mount) and runs a Claude agent on the files. The agent reviews a synthetic contract against a legal playbook. The memo syncs back to Box, and a change made in Box syncs back into the running sandbox.

**The agent gets files, never Box credentials.** Box Mount runs as its own Linux user and is the only process that can read the Box token. The agent runs as a second user that can read the mounted folder and nothing else.

> [!IMPORTANT]
> Box Mount is in private preview and has no public package yet. To get it, request preview access with the form in Box's [Box Mount guide](https://developer.box.com/guides/box-mount). Box sends you the Linux binary. It is not part of this repository: you drop it into `private/` (see [Add the Box Mount package](#add-the-box-mount-package)), and everything else works as is.

## How it works

```
Box folder                         E2B sandbox
├─ Incoming/Kestrel-MSA.docx ─▶   /srv/box  (synced by box-mount, user "boxmount")
├─ Playbook/contract-playbook.md ─▶ │
└─ Reviewed/                         ▼
     Kestrel-MSA-review.md  ◀──   Claude agent (user "agent", read-only tools)
                                  memo saved into /srv/box/Reviewed by the orchestrator
```

1. `npm start` opens the Box folder in your browser and uploads the synthetic contract and playbook to it.
2. It starts a sandbox from the template, writes the Box token into Box Mount's private directory, and `box-mount mount` syncs the Box folder to `/srv/box` and keeps syncing in the background.
3. The agent (Claude Haiku 4.5 by default) reads the contract and the playbook from `/srv/box` and returns a review memo.
4. The memo is saved to `/srv/box/Reviewed/`. Box Mount uploads it, and the script waits until it is in Box.
5. The script adds a reviewer note to the memo in Box and waits until the sandbox sees the new version.

## Prerequisites

- Node.js 22.18 or later
- An [E2B API key](https://e2b.dev/dashboard)
- An [Anthropic API key](https://console.anthropic.com/settings/keys)
- The Box Mount Linux x86_64 binary (or the archive Box sent you), from the [Box Mount preview](https://developer.box.com/guides/box-mount)
- A Box account with:
  - an app in the [Box Developer Console](https://app.box.com/developers/console) (**User** app type, scopes: read and write all files and folders)
  - a developer token from **Configuration > Developer Token**. It expires after 60 minutes and cannot be refreshed, so generate it right before you run the demo.
  - an empty folder. Its ID is the number at the end of the folder URL.

## Setup

```bash
cd examples/box-mount-contract-review-js
npm install
npx playwright install chromium   # the browser window that follows the run
cp .env.example .env   # fill in everything except BOX_ACCESS_TOKEN for now
```

### Add the Box Mount package

Drop what Box sent you into `private/`, as is:

```
private/
├─ README.md
└─ box-mount-0.6.0-linux-x86_64.tar.gz   # or a .tgz, a .zip, or the bare binary
```

Any file name works. The template build unpacks a `.tar.gz`, `.tgz` or `.zip`, looks for exactly one Linux x86_64 executable inside (see `src/install-box-mount.sh`), and installs it as `box-mount`. Everything in `private/` except its `README.md` is git-ignored, so the binary never gets committed. When Box publishes a newer build, replace the file and run `npm run build-template` again.

Build the sandbox template. This bakes in Box Mount, the two Linux users and the agent. No credentials go into the template.

```bash
npm run build-template
```

## Run

Generate the Box developer token now, not earlier: it expires 60 minutes after you create it. Put it in `.env` as `BOX_ACCESS_TOKEN`, then run:

```bash
npm run doctor   # optional: checks keys, the Box folder, the template and the user isolation
npm start
```

A Chromium window opens and follows the run in Box, so you see what the agent is doing: the folder as the contract arrives, each file as the agent reads it inside the sandbox, then the review as soon as it is in Box. The first time, sign in to Box in that window; it keeps its own profile in `.browser-profile/`, so later runs start signed in. The terminal logs each step and every tool call the agent makes:

```
  E2B × Box Mount × Claude  contract review
  ────────────────────────────────────────────────────────────
  Task      Review Incoming/Kestrel-MSA.docx against Playbook/contract-playbook.md
  Box       https://app.box.com/folder/427413049619
  Account   Ondrej Drapalik (odrapalik@e2b.dev)
  Model     claude-haiku-4-5-20251001

  ① Drop a contract into Box
    ✓ Uploaded Incoming/Kestrel-MSA.docx
    ✓ Uploaded Playbook/contract-playbook.md

  ② Mount the Box folder in an E2B sandbox
    ✓ Sandbox in93fo2ajyshe3xpmc7q6
    ✓ Mounted at /srv/box
    /srv/box | box_folder_id=427413049619 | pid=1508 | status=running

  ③ Claude reads it inside the sandbox
    ● read_docx  Incoming/Kestrel-MSA.docx
      └  0.1s  3,448 chars
    ● Read  Playbook/contract-playbook.md
      └  0.0s  2,257 chars
    ✓ Agent finished in 3 turns · 2 tool calls · USD 0.0248

  ④ The review syncs to Box
    ✓ Saved Reviewed/Kestrel-MSA-review.md in the mounted folder
    ✓ Memo is in Box 2.8s after saving

    10 deviations, 3 critical
    Critical §8.1        "Kestrel's total liability under this Agreement will not exceed the fees Customer…
    Critical §3.2        "Kestrel may use Customer Data to provide, maintain and improve the Service, incl…
    High     §4.2        "Kestrel will notify Customer of a security incident that affects Customer Data w…
    ...

  ⑤ A change in Box syncs back to the sandbox
    ✓ Uploaded a new version of the memo with a reviewer note
    ✓ The sandbox sees the new version 3.9s later

  ✓ Done in 62s
  Review    https://app.box.com/file/2526164307862
  Box       https://app.box.com/folder/427413049619
  Sandbox   in93fo2ajyshe3xpmc7q6, files at /srv/box

  Press Enter to unmount the folder and destroy the sandbox.
```

The number of deviations varies a little between runs. The sandbox keeps running until you press Enter, so you can edit the memo in Box and run `npm run status` in another terminal to see what the sandbox sees. Enter (or Ctrl+C) runs Box Mount's final sync, unmounts and destroys the sandbox.

Options:

- `npm start -- --record` also records the Box window to `recordings/` (WebM, real time).
- `npm start -- --no-browser` runs in the terminal only.
- `npm start -- --no-box-edit` skips step 5, so you can make the edit yourself in Box.

## Clean up

`npm start` cleans up when you press Enter, when it fails, and on Ctrl+C. If it could not (a second Ctrl+C quits at once), run:

```bash
npm run teardown
```

Both run Box Mount's final sync, unmount and destroy the sandbox. If the final sync is incomplete (for example, the token expired), the files that did not reach Box are copied to `recovered/<sandbox-id>/` before the sandbox is destroyed. Everything that synced stays in Box.

## Where to read the code

- `src/start.ts`: the whole flow, in five numbered steps. `src/tui.ts` only prints, and `src/window.ts` drives the Box window.
- `src/sandbox.ts`: everything that runs in the sandbox (Box Mount, files in the mount, the agent, shutdown).
- `src/template.ts`: the template, with the two Linux users.
- `agent/review.ts`: the agent itself, and `agent/workspace.ts`: the rule that keeps it inside `/srv/box`.

`npm test` runs the typecheck, lint and unit tests (no network). The end-to-end run is `npm run doctor`, then `npm start`.

## Security notes

- **Two users.** `boxmount` owns `/opt/box-mount` (mode 0700) with the token in `box-config.json` (mode 0600). `agent` is in the `boxmount` group, so it can read `/srv/box`, but it cannot read `/opt/box-mount` and has no sudo. `npm run doctor` checks this, including that the agent cannot switch users.
- **Box content is data, not configuration.** Anyone with access to the Box folder can add files to it. The agent runs with `settingSources: []` and `strictMcpConfig: true`, so a `.claude/settings.json` hook or a `.mcp.json` server in the folder never runs. The agent's only tools are `Read`, `Glob` and a `read_docx` tool, and a hook in `agent/workspace.ts` limits all three to `/srv/box`.
- **No path to root.** E2B's default `user` has passwordless sudo, so the template removes the setuid bit from `su`. Otherwise the agent could switch to `user`.
- **The model key is not hidden from the agent process.** `ANTHROPIC_API_KEY` is passed to the agent command only, and the agent's tools cannot read outside `/srv/box`, but code running as `agent` could still read its own environment. To keep the model key out of the sandbox as well, put a credential-injecting proxy in front of the API.
- **The agent reads; the orchestrator writes.** The agent returns the memo, and the orchestrator saves it into the mount as `boxmount`. In our tests, Box Mount uploaded new files from any user but could not update a file that another user owns (for example when a new version came from Box), and it saved downloaded files with mode 644 (read-only for the agent). Files are updated in place (no temp file and rename), so Box keeps a version history.

## Limitations

- Box Mount is in private preview with no SLA. Limits: 5 GB and 10,000 files per mount.
- Developer tokens last 60 minutes. When the token expires, Box Mount stops syncing at the next change (`npm run status` shows `status=stopped`); `npm run teardown` then copies the unsynced files to `recovered/`. For longer runs, use JWT (a service account) or OAuth (a user's own account). See [Box Mount authentication](https://developer.box.com/guides/box-mount).
- E2B sandboxes on the Hobby plan run for up to 1 hour.
- Free Box accounts do not show version history.

Tested with Box Mount 0.6.0 (September 2026 preview build), E2B SDK 2.53.1, Claude Agent SDK 0.3.292 and Node.js 22. Box Mount behavior can change between preview builds.

The contract and the review are synthetic and are not legal advice.
