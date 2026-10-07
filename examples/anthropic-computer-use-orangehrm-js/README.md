# Claude computer use + browser use: Excel to OrangeHRM

Claude does "swivel chair" office work on an [E2B desktop sandbox](https://e2b.dev/docs/desktop): it reads new hires from an Excel file in LibreOffice Calc, enters each one into [OrangeHRM](https://opensource-demo.orangehrmlive.com) (an open-source HR system with no API in reach), and writes the Employee Id OrangeHRM assigns back into the spreadsheet. The live desktop opens in your browser so you can watch, and the terminal logs every tool call.

## Two toolsets, one desktop

| Toolset | Works on | How |
| --- | --- | --- |
| `E2BComputerToolset` (computer use) | LibreOffice Calc | Screenshots, mouse and keyboard |
| `E2BBrowserToolset` (browser use) | OrangeHRM in Chrome | The page itself: elements, forms, navigation |

Calc is a desktop app with nothing else to drive it by, so Claude uses computer use there. OrangeHRM is a web form, where browser use is faster and more precise than clicking pixels. Claude switches between the two within one run.

One detail needs computer use on the browser side too: Chrome's own "save password" popup sits outside the page, so the browser tools cannot see it. The task tells Claude to dismiss it with the computer tools.

The sandbox can reach only `opensource-demo.orangehrmlive.com`: E2B's egress firewall blocks everything else, and the browser toolset's URL policy refuses navigation anywhere else.

## Techstack

- [E2B Desktop SDK](https://github.com/e2b-dev/desktop) for the Linux desktop with Chrome and LibreOffice
- [`@e2b/claude-toolsets`](https://github.com/e2b-dev/claude-toolsets) for the E2B drivers of Claude's browser and computer use toolsets
- [Anthropic SDK](https://www.npmjs.com/package/@anthropic-ai/sdk) with Claude Sonnet 5.5
- TypeScript

## Setup

### 1. Pre-release packages

The toolset helpers are not in the published Anthropic SDK yet. Until they are, `package.json` installs both packages from a local clone of [e2b-dev/claude-toolsets](https://github.com/e2b-dev/claude-toolsets) next to this repo (`../../../claude-toolsets`):

- `@anthropic-ai/sdk` from its vendored early-access build, `vendor/anthropic-ai-sdk-preview-*.tgz`
- `@e2b/claude-toolsets` from `packages/claude-toolsets-js` (build it first with `pnpm install && pnpm build` there)

`.npmrc` sets `install-links=true`, so the toolsets package is copied in and shares this example's Anthropic SDK.

### 2. Set up API keys

- Copy `.env.template` to `.env`
  - Get the [E2B API KEY](https://e2b.dev/docs/getting-started/api-key)
  - Get the [ANTHROPIC API KEY](https://console.anthropic.com/settings/keys)

### 3. Install packages

```
npm i
```

### 4. Run the example

```
npm run start
```

The live view opens in your browser. When Claude finishes, the updated spreadsheet is saved to `output/new_hires.xlsx`; press Enter to close the desktop.

Edit `new_hires.csv` to change the hires. LibreOffice turns it into `new_hires.xlsx` inside the sandbox, so there is nothing to generate locally.

```csv
First Name,Middle Name,Last Name,OrangeHRM Employee Id
Marta,,Novakova,
Priya,Lakshmi,Raman,
Tomas,,Hruby,
```

The [OrangeHRM demo](https://opensource-demo.orangehrmlive.com) is public and shared (sign in as `Admin` / `admin123`). It is reset regularly, so the employees Claude adds do not stay.

## How it works

All in [`index.ts`](index.ts):

1. **Create a private desktop.** `Sandbox.create` with `allowPublicTraffic: false` and egress allowed only to OrangeHRM; `liveView` proxies the desktop stream to a local URL so you can watch.
2. **Seed the spreadsheet.** Upload `new_hires.csv` and convert it with `soffice --headless --convert-to xlsx` inside the sandbox.
3. **Start both toolsets.** `E2BBrowserToolset.create({ sandbox: desktop, urlPolicy })` starts Chrome on the desktop; Calc opens after it so it is in front for Claude's first screenshot; then `E2BComputerToolset.create(desktop)`.
4. **Run Claude.** Both toolsets go into `tools` of the tool runner, and the task says which toolset to use for each step.
5. **Download the result and clean up.** Close both toolsets (the tool runner never does), download `new_hires.xlsx` to `output/`, and kill the desktop.

`tui.ts` only prints: the header, every tool call tagged `browser` or `computer`, and Claude's answer. Remove its calls and `index.ts` is plain package usage.

## Feedback

If you encounter any problems, please let us know at our [Discord](https://discord.com/invite/U7KEcGErtQ).

If you want to let the world know about what you're building with E2B, tag [@e2b_dev](https://twitter.com/e2b_dev) on X (Twitter).

## Visit our docs

Check the [documentation](https://e2b.dev/docs) to learn more about how to use E2B.
