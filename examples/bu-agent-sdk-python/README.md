# BU Agent SDK with E2B Code Interpreter

This example shows how to use [bu-agent-sdk](https://github.com/browser-use/agent-sdk) with E2B's [Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter) for data analysis. The agent analyzes CSV data and generates visualizations.

## Setup & run

### 1. Install dependencies

```bash
uv sync
```

### 2. Set up `.env`

1. Copy `.env.template` to `.env`
2. Get [E2B API key](https://e2b.dev/dashboard?tab=keys)
3. Get [Anthropic API key](https://platform.claude.com/settings/keys)

### 3. Run the example

```bash
uv run python main.py
```

The agent will:
- Spin up an E2B sandbox with pandas, numpy, matplotlib
- Upload `data/employees.csv`
- Analyze the data and generate charts
- Download charts to `output/`
