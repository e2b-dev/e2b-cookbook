# GitHub Copilot CLI in E2B Sandbox (Python)

This example runs [GitHub Copilot CLI](https://github.com/github/copilot-cli) headless in an E2B sandbox. It creates a sandbox from the pre-built `copilot` template, writes a small Python project with a failing test, asks Copilot CLI to fix it with `copilot --allow-all-tools -s -p "..."`, then prints the `git diff` and reruns the test.

See the [GitHub Copilot CLI guide](https://e2b.dev/docs/agents/copilot-cli) for streaming events, resuming sessions, and building a custom template.

## Authentication

Set one of these in `.env` (see `.env.example`):

- `COPILOT_GITHUB_TOKEN`: a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with the **Copilot Requests** permission, on an account with a Copilot plan. Classic tokens (`ghp_`) are rejected.
- `OPENAI_API_KEY`: used when `COPILOT_GITHUB_TOKEN` is not set. Copilot CLI then calls OpenAI directly through its custom provider settings (`COPILOT_PROVIDER_*`, see `copilot help providers`), with no GitHub account.

You also need `E2B_API_KEY` from the [E2B dashboard](https://e2b.dev/dashboard).

## Run

```bash
cp .env.example .env   # then fill in the keys
uv run main.py
```
