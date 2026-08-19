# OpenAI Agents SDK E2B Examples

The [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) is a framework for building agentic workflows. E2B provides a native integration that lets you run `SandboxAgent` instances inside isolated E2B sandboxes — giving your agents full filesystem, terminal, and network access in a secure environment.

## Install the dependencies

Install the [OpenAI Agents SDK](https://pypi.org/project/openai-agents/) with the E2B extra to pull in the sandbox integration.

```bash
pip install openai-agents[e2b]
```

You will also need API keys for OpenAI and E2B.

```bash
export OPENAI_API_KEY="..."
export E2B_API_KEY="..."
```

## Examples

This folder contains runnable E2B examples that showcase different ways to use E2B-backed sandboxes with the Agents SDK.

For notebook-based walkthroughs, see [notebooks](./notebooks).

Entries:

- `basic.py`
  A minimal single-agent E2B sandbox example that prepares a tiny workspace, forces one shell inspection step, and answers a short question about the files.

- `codex_website.py`
  Creates the documented E2B `codex` sandbox template, exposes each workflow step as a tool call, and lets an orchestrator agent create the sandbox, run `codex exec --full-auto --skip-git-repo-check`, inspect outputs, and return a live preview URL for the generated static site.

- `deep_research_mcp.py`
  Uses `SandboxAgent` with an E2B-backed session, enables Exa and Browserbase MCP servers at sandbox creation time, connects the SDK to the sandbox MCP gateway, and runs a deep-research prompt that discovers sources with Exa and verifies pages with Browserbase.

- `desktop_repl.py`
  A minimal interactive desktop-agent REPL that starts the `e2b/openai-desktop` template, prints the public noVNC URL, and lets the assistant control the desktop with logged shell and computer tool calls between turns.

- `forecast_model_bakeoff.py`
  A coordinator agent launches multiple forecasting lanes in parallel across E2B sandboxes, compares real FRED-series holdout metrics, and recommends the strongest default model family. Default model is `gpt-5.4-mini` for speed because the example relies on parallel worker tool calls.

- `fullstack_code_review_parallel.py`
  A coordinator agent that launches parallel frontend runtime, backend runtime, and git-tree review sandboxes, then merges the findings into one review summary.

- `homepage_prototype_parallel.py`
  A coordinator agent generates multiple homepage directions in parallel across E2B sandboxes, then returns preview URLs and screenshots. Default model is `gpt-5.4-mini` for speed because the example relies on parallel worker tool calls.

- `homepage_prototype_simple.py`
  A smaller single-sandbox homepage prototyping example that reuses the shared prototype helpers without the full parallel coordinator flow.

- `parallel_anomaly_triage.py`
  A coordinator agent sends separate incident-investigation lanes to parallel E2B sandboxes, then synthesizes a likely root cause and next actions from the returned evidence. Default model is `gpt-5.4-mini` for speed because the example relies on parallel worker tool calls.

- `sarima_grid_search_parallel.py`
  Parallel SARIMA candidate evaluation where each sandbox fits a batch of models and returns holdout metrics plus artifacts.
