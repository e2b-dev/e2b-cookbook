# Stirrup Agent with E2B Code Interpreter

This example shows how to use [Stirrup](https://github.com/ArtificialAnalysis/stirrup) with E2B's [Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter) for safe LLM code execution. In this example, the agent generates Fibonacci numbers and creates a visualization chart.

## Setup & run

### 1. Install dependencies

```bash
uv sync
```

### 2. Set up `.env`

1. Copy `.env.template` to `.env`
2. Get [E2B API key](https://e2b.dev/docs/getting-started/api-key)
3. Get [OpenRouter API key](https://openrouter.ai/keys)

### 3. Run the example

```bash
uv run python main.py
```
