# AI/ML API with E2B Code Interpreter

This example demonstrates how to run the [AI/ML API](https://aimlapi.com/app/?utm_source=e2b&utm_medium=github&utm_campaign=integration) with the [E2B Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter).
The script sends a prompt to an AI/ML API model and executes the returned Python code in a secure E2B sandbox.

## Prerequisites
- Python 3.11+
- `AIML_API_KEY` and `E2B_API_KEY` environment variables

## Setup & run

### 1. Install dependencies
```bash
poetry install
````

### 2. Set up `.env`

1. Copy `.env.template` to `.env`
2. Get [E2B API key](https://e2b.dev/docs/getting-started/api-key)
3. Get [AIML API key](https://aimlapi.com/app/?utm_source=e2b&utm_medium=github&utm_campaign=integration) and set it as `AIML_API_KEY` in `.env`

## Run the example

Install dependencies and execute the script:

```bash
pip install openai e2b-code-interpreter python-dotenv
python aimlapi_hello_world/main.py
```

### Models

The example uses **`openai/gpt-5-chat-latest`** by default. You can switch to any OpenAI-compatible model available via AI/ML API (make sure your key has access).
