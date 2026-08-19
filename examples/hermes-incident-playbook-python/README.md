# Self-improving incident playbook with Hermes + E2B (Python)

This example runs [Hermes Agent](https://github.com/NousResearch/hermes-agent) inside one E2B sandbox for two independent incident investigations. During the first investigation, Hermes uses terminal and file tools to analyze evidence, writes a report, saves a compact memory, and turns the successful procedure into a reusable skill. A fresh Hermes session then preloads that skill and applies it to a different incident.

The scenario is designed around Hermes' closed learning loop rather than a generic agent prompt. E2B contains the autonomous tool calls and preserves the workspace, `~/.hermes/memories`, sessions, and user-created skills for the lifetime of the sandbox.

## What the demo does

1. Creates a sandbox from the pre-built E2B `hermes` template.
2. Uploads an incident runbook and two synthetic checkout incidents.
3. Starts a headless Hermes session that investigates latency and creates the `incident-triage` skill.
4. Verifies the skill exists under `~/.hermes/skills`.
5. Starts a fresh session with `--skills incident-triage` and investigates a release-correlated error spike.
6. Keeps both reports in the sandbox workspace until the demo cleans up.

The first incident points to upstream payment latency rather than the nearby checkout release. The second incident points to a release-specific regression. This makes the learned playbook apply decision rules instead of repeating the same answer.

## Setup

Copy the environment template, add your E2B and OpenRouter API keys, and load it into the current shell.

```bash
cd examples/hermes-incident-playbook-python
cp .env.example .env
# Edit .env with real credentials.
set -a
source .env
set +a
```

Install the project and run its non-live unit tests.

```bash
uv sync
uv run python -m unittest discover -s tests -v
```

`HERMES_PROVIDER`, `HERMES_MODEL`, and `HERMES_PROVIDER_KEY_ENV` make the demo model-agnostic. For example, set `HERMES_PROVIDER=anthropic`, `HERMES_MODEL=claude-sonnet-4-6`, `HERMES_PROVIDER_KEY_ENV=ANTHROPIC_API_KEY`, and export that key to use Anthropic directly. `HERMES_TEMPLATE` can point the demo at a tagged or private template during development; it defaults to `hermes`.

## Run the playbook

```bash
uv run python main.py
```

The driver runs the equivalent Hermes lifecycle inside one sandbox:

```bash
hermes chat -Q --yolo --provider <provider> --model <model> \
  --toolsets terminal,file,skills,memory \
  -q "Investigate the first incident and create the incident-triage skill"

hermes chat -Q --yolo --provider <provider> --model <model> \
  --toolsets terminal,file,skills,memory --skills incident-triage \
  -q "Apply the learned skill to the next incident"
```

`-Q` keeps stdout concise for automation. `--yolo` lets Hermes use tools without waiting for an interactive approval; those actions remain contained inside E2B. Sandboxes can reach the open internet by default, so use [network rules](https://e2b.dev/docs/network/internet-access) when processing untrusted input or tightly scoped credentials.

The live demo creates an E2B sandbox and makes provider inference calls. `main.py` always kills the sandbox in a `finally` block, including when Hermes or the provider fails.
