# OpenAI computer use on an E2B desktop

`gpt-6-luna` works an [E2B desktop sandbox](https://e2b.dev/docs/desktop) through screenshots, mouse and keyboard, using the computer-use helpers in the [OpenAI Python SDK](https://github.com/openai/openai-python) (`openai.lib.computer.ComputerToolset`). The helper runs the Responses loop; you supply the driver that performs each action. Here that driver is [`E2BDriver`](e2b_driver.py), one short class that turns each action into xdotool calls on the E2B desktop. The live desktop opens in your browser so you can watch, and the terminal logs every action.

The same examples in TypeScript: [`openai-computer-use-js`](../openai-computer-use-js).

| File | What it is |
| --- | --- |
| [`1-run.py`](1-run.py) | **Hello world.** The task from OpenAI's guide: Luna opens one of two text files in the file manager and reads back its order number, checked against the number the script generated. Start here. |
| [`2-orangehrm.py`](2-orangehrm.py) | **Excel to OrangeHRM.** "Swivel chair" office work: Luna reads new hires from an Excel file in LibreOffice Calc, enters each one into [OrangeHRM](https://opensource-demo.orangehrmlive.com) (an open-source HR system with no API in reach), and writes the Employee Id OrangeHRM assigns back into the spreadsheet. |
| [`e2b_driver.py`](e2b_driver.py) | Helper, not an example: `E2BDriver`, the live view, and the `ComputerToolset.run` call both examples share. |

`2-orangehrm.py` is the same demo as the Claude example [`anthropic-computer-use-orangehrm-js`](../anthropic-computer-use-orangehrm-js): same `new_hires.csv`, same steps, same egress allowlist. One difference: this example uses only the computer tool, so Luna drives OrangeHRM in Chrome by pixels too, the same way it drives Calc. The OpenAI SDK also has a browser toolset, but it needs a browser driver for the E2B desktop, which this example does not include.

The OrangeHRM desktop can reach only `opensource-demo.orangehrmlive.com`: E2B's egress firewall blocks everything else. The hello-world desktop has no internet access at all.

## Techstack

- [E2B Desktop SDK](https://github.com/e2b-dev/desktop) for the Linux desktop with Chrome and LibreOffice
- [OpenAI Python SDK](https://github.com/openai/openai-python) 3.31.0, the first release with `openai.lib.computer`, with `gpt-6-luna`
- Python and [uv](https://docs.astral.sh/uv/)

## Setup

### 1. Set up API keys

- Copy `.env.template` to `.env`
  - Get the [E2B API KEY](https://e2b.dev/docs/getting-started/api-key)
  - Get the [OPENAI API KEY](https://platform.openai.com/api-keys)

### 2. Install packages

```
uv sync
```

`pyproject.toml` skips package versions published in the last 7 days (a supply-chain guard), except the pinned `openai` release.

### 3. Run the examples

```
uv run --env-file .env 1-run.py
uv run --env-file .env 2-orangehrm.py
```

The live view opens in your browser. When Luna finishes, the final screen is saved to `output/`, and `2-orangehrm.py` also downloads the updated spreadsheet to `output/new_hires.xlsx`; press Enter to close the desktop. Set `OPENAI_MODEL` to try another model.

In our runs, `1-run.py` took about 20 seconds and under $0.001, and `2-orangehrm.py` about 4 to 5 minutes and about $0.02 in OpenAI tokens (most of each screenshot is served from the prompt cache).

Edit `new_hires.csv` to change the hires. LibreOffice turns it into `new_hires.xlsx` inside the sandbox, so there is nothing to generate locally.

```csv
First Name,Middle Name,Last Name,OrangeHRM Employee Id
Marta,,Novakova,
Priya,Lakshmi,Raman,
Tomas,,Hruby,
```

The [OrangeHRM demo](https://opensource-demo.orangehrmlive.com) is public and shared (sign in as `Admin` / `admin123`). It is reset regularly, so the employees Luna adds do not stay.

## How it works

1. **Create a desktop.** `Sandbox.create` at 1280x800 with an egress allowlist; `live_view` starts the desktop stream (view-only, password-protected) and opens it in your browser.
2. **Seed it.** `1-run.py` writes two text files and opens the folder. `2-orangehrm.py` uploads `new_hires.csv`, converts it with `soffice --headless --convert-to xlsx`, starts Chrome, then opens Calc after it so Calc is in front for the first screenshot.
3. **Run the model.** `ComputerToolset(E2BDriver(desktop)).run(client, {"model": "gpt-6-luna", "tools": [{"type": "computer"}], ...})` loops until the model answers. Every action goes through `before_action`, which prints it; `approve_safety_checks` approves the model's safety checks, since this is an unattended demo on a throwaway desktop.
4. **Download the result and clean up.** Save the final screen (and the spreadsheet) to `output/`, then kill the desktop.

## Feedback

If you encounter any problems, please let us know at our [Discord](https://discord.com/invite/U7KEcGErtQ).

If you want to let the world know about what you're building with E2B, tag [@e2b_dev](https://twitter.com/e2b_dev) on X (Twitter).

## Visit our docs

Check the [documentation](https://e2b.dev/docs) to learn more about how to use E2B.
