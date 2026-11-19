# Gemini CLI in E2B Sandbox (Python)

This example runs [Gemini CLI](https://github.com/google-gemini/gemini-cli) headless in an E2B sandbox. It creates a sandbox from the pre-built `gemini` template, writes a small Python project with a failing test, asks Gemini CLI to fix it with `gemini --skip-trust --yolo -p "..."`, then prints the `git diff` and reruns the test.

See the [Gemini CLI guide](https://e2b.dev/docs/agents/gemini-cli) for streaming events, resuming sessions, and building a custom template.

## Authentication

Set these in `.env` (see `.env.example`):

- `GEMINI_API_KEY`: a paid Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). Gemini CLI no longer serves Google-account sign-ins on the free or AI Pro/Ultra plans; use [Antigravity CLI](https://e2b.dev/docs/agents/antigravity-cli) for those.
- `GEMINI_MODEL` (optional): the model Gemini CLI uses, for example a Flash model for cheaper runs.

You also need `E2B_API_KEY` from the [E2B dashboard](https://e2b.dev/dashboard).

## Run

Requires Python 3.11 or newer and [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env   # then fill in the keys
uv run main.py
```
