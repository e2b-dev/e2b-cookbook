# Build Custom Code Interpreter with E2B and GPT-4
**This is a repo accompanying the [official E2B guide](TODO) on how to build your own custom code interpreter.**

## How to start
1. Clone this repository
2. Open the `e2b-cookbook/guides/gpt4-code-interpreter-py` directory
3. Install dependencies:
```sh
poetry install
```
4. Rename `.env.example` to `.env` and set up the API keys
5. Start the app:
```sh
poetry run python3 gpt4_code_interpreter/main.py
```