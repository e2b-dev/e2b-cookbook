# OpenAI computer use on an E2B desktop (TypeScript)

`gpt-6-luna` works an [E2B desktop sandbox](https://e2b.dev/docs/desktop) through screenshots, mouse and keyboard, using the computer-use helpers in the [OpenAI Node SDK](https://github.com/openai/openai-node) (`ComputerToolset` from `openai/helpers/computer`). The helper runs the Responses loop; you supply the driver that performs each action. Here that driver is [`E2BDriver`](e2b-driver.ts), one short class that turns each action into xdotool calls on the E2B desktop. The live desktop opens in your browser so you can watch, and the terminal logs every action.

OpenAI's [computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use) offers two ways to connect a model to a screen, and this folder shows both:

- **The computer tool** (`1-run.ts`, `2-orangehrm.ts`): the model returns structured clicks and keystrokes, and `E2BDriver` performs them.
- **Code execution** (`1-run-code-exec.ts`, `2-orangehrm-code-exec.ts`), the path OpenAI recommends for `gpt-6-astra`: the model gets one function tool, `exec_js`, and writes [Playwright](https://playwright.dev) code against Chrome on the desktop. That code runs in a persistent Node process inside the E2B desktop, never on your machine, and returns its logs and screenshots. It can read the page's text and click elements by role instead of by pixels. For apps outside the browser, such as LibreOffice Calc, the runtime adds a small `desktop` object: a full-screen screenshot, click, type and key, through scrot and xdotool.

The same examples in Python: [`openai-computer-use-python`](../openai-computer-use-python), where the code-execution example drives the whole desktop with PyAutoGUI (`exec_py`).

| File | What it is |
| --- | --- |
| [`1-run.ts`](1-run.ts) | **Hello world.** The task from OpenAI's guide: Luna opens one of two text files in the file manager and reads back its order number, checked against the number the script generated. Start here. |
| [`2-orangehrm.ts`](2-orangehrm.ts) | **Excel to OrangeHRM.** "Swivel chair" office work: Luna reads new hires from an Excel file in LibreOffice Calc, enters each one into [OrangeHRM](https://opensource-demo.orangehrmlive.com) (an open-source HR system with no API in reach), and writes the Employee Id OrangeHRM assigns back into the spreadsheet. |
| [`1-run-code-exec.ts`](1-run-code-exec.ts) | **Hello world with code execution.** The same orders folder, shown in Chrome: `gpt-6-astra` opens the file by writing Playwright code through `exec_js`. Needs the template from `template.ts`. |
| [`2-orangehrm-code-exec.ts`](2-orangehrm-code-exec.ts) | **Excel to OrangeHRM with code execution.** The same task and desktop as `2-orangehrm.ts`, driven by `gpt-6-astra` through `exec_js`: Playwright for OrangeHRM, the `desktop` helpers for Calc. Needs the template from `template.ts`. |
| [`e2b-driver.ts`](e2b-driver.ts) | Helper, not an example: `E2BDriver`, the live view, and the `ComputerToolset.run` call the computer-tool examples share. |
| [`code-exec.ts`](code-exec.ts) | Helper: the `exec_js` tool, starting Chrome and the runtime on a desktop, and the Responses loop from OpenAI's code-execution guide. |
| [`exec-js-runtime.mjs`](exec-js-runtime.mjs) | Runs inside the desktop, not on your machine: the persistent Node context with Playwright's `browser`, `context` and `page`, `console.log`, `display` and `desktop`, adapted from [OpenAI's CUA sample app](https://github.com/openai/openai-cua-sample-app). |
| [`template.ts`](template.ts) | Builds the `openai-computer-use-exec-js` E2B template: the stock desktop plus Node 22 and `playwright-core`. |

`2-orangehrm.ts` is the same demo as the Claude example [`anthropic-computer-use-orangehrm-js`](../anthropic-computer-use-orangehrm-js): same `new_hires.csv`, same steps, same egress allowlist. One difference: this example uses only the computer tool, so Luna drives OrangeHRM in Chrome by pixels too, the same way it drives Calc. The OpenAI SDK also has a browser toolset, but it needs a browser driver for the E2B desktop, which this example does not include.

The OrangeHRM desktop can reach only `opensource-demo.orangehrmlive.com`: E2B's egress firewall blocks everything else. The hello-world desktop has no internet access at all.

## Techstack

- [E2B Desktop SDK](https://github.com/e2b-dev/desktop) for the Linux desktop with Chrome and LibreOffice
- [OpenAI Node SDK](https://www.npmjs.com/package/openai) 7.33.0, the first release with `openai/helpers/computer`, with `gpt-6-luna` (computer tool) and `gpt-6-astra` (code execution)
- [Playwright](https://playwright.dev) (`playwright-core`) inside the desktop, for code execution
- TypeScript on Node 22 or newer

## Setup

### 1. Set up API keys

- Copy `.env.template` to `.env`
  - Get the [E2B API KEY](https://e2b.dev/docs/getting-started/api-key)
  - Get the [OPENAI API KEY](https://platform.openai.com/api-keys)

### 2. Install packages

```
npm i
```

### 3. Build the code-execution template

Only the `*-code-exec.ts` examples need it. Build it once per E2B team; it takes about a minute.

```
npm run template
```

### 4. Run the examples

```
npm run start       # 1-run.ts
npm run orangehrm   # 2-orangehrm.ts
npm run code-exec   # 1-run-code-exec.ts
npm run orangehrm:code-exec   # 2-orangehrm-code-exec.ts
```

The live view opens in your browser. When the model finishes, the final screen is saved to `output/`, and the OrangeHRM examples also download the updated spreadsheet to `output/new_hires.xlsx`; press Enter to close the desktop. Set `OPENAI_MODEL` to try another model.

In our runs, `1-run.ts` took about 20 seconds and under $0.001, and `2-orangehrm.ts` about 4 to 5 minutes and about $0.01 to $0.02 in OpenAI tokens (most of each screenshot is served from the prompt cache). `1-run-code-exec.ts` took about 35 seconds end to end, including the desktop's start, and Astra needed two `exec_js` calls: one to read the folder listing, one to click the file and read its text. `2-orangehrm-code-exec.ts` needed 15 `exec_js` calls in our run.

Edit `new_hires.csv` to change the hires. LibreOffice turns it into `new_hires.xlsx` inside the sandbox, so there is nothing to generate locally.

```csv
First Name,Middle Name,Last Name,OrangeHRM Employee Id
Marta,,Novakova,
Priya,Lakshmi,Raman,
Tomas,,Hruby,
```

The [OrangeHRM demo](https://opensource-demo.orangehrmlive.com) is public and shared (sign in as `Admin` / `admin123`). It is reset regularly, so the employees Luna adds do not stay.

## How it works

1. **Create a desktop.** `Sandbox.create` at 1280x800 with an egress allowlist; `liveView` starts the desktop stream (view-only, password-protected) and opens it in your browser.
2. **Seed it.** `1-run.ts` writes two text files and opens the folder. `2-orangehrm.ts` uploads `new_hires.csv`, converts it with `soffice --headless --convert-to xlsx`, starts Chrome, then opens Calc after it so Calc is in front for the first screenshot.
3. **Run the model.** `new ComputerToolset(new E2BDriver(desktop)).run(client, { model: 'gpt-6-luna', tools: [{ type: 'computer' }], ... })` loops until the model answers. Every action goes through `beforeAction`, which prints it; `approveSafetyChecks` approves the model's safety checks, since this is an unattended demo on a throwaway desktop. `AbortSignal.timeout` bounds the whole run.
4. **Download the result and clean up.** Save the final screen (and the spreadsheet) to `output/`, then kill the desktop.

### Code execution

1. **Start the desktop from the template.** `Sandbox.create('openai-computer-use-exec-js', ...)` gives the same desktop with Node and `playwright-core` installed, and the script writes the same two order files.
2. **Start Chrome and the runtime.** `startRuntime` opens the desktop's own Chrome, maximized on `file:///home/user/orders/`, with the DevTools protocol on inside the sandbox. It then uploads `exec-js-runtime.mjs`, which connects Playwright to that Chrome over CDP, keeps one context for the whole run, and listens on a Unix socket inside the sandbox, so nothing is exposed outside it.
3. **Run the model.** `run` is the loop from OpenAI's guide: `responses.create` with the `exec_js` function tool, chained with `previous_response_id`. Each `function_call` is written to a file on the desktop, and a `curl` POST over the socket tells the runtime to run it; the runtime returns `input_text` and `input_image` items, which go back unchanged as the `function_call_output`. The terminal prints every call's code.

Unlike OpenAI's sample app, which runs the generated code on your own computer, here it runs in a throwaway E2B desktop with no internet access, and you watch Chrome through the live view.

## Feedback

If you encounter any problems, please let us know at our [Discord](https://discord.com/invite/U7KEcGErtQ).

If you want to let the world know about what you're building with E2B, tag [@e2b_dev](https://twitter.com/e2b_dev) on X (Twitter).

## Visit our docs

Check the [documentation](https://e2b.dev/docs) to learn more about how to use E2B.
