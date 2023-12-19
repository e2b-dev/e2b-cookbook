# Create an AI GitHub developer that uses E2B Sandbox

A custom AI assistant that can clone any GitHub repository to its remote cloud environment, work on the repo there, and then make pull request to GitHub.

The AI developer uses E2B sandboxes for the remote execution of tasks.

You can write code, edit existing content in the repo, create new files, or list current files.

## How to start
1. Clone this repository
2. Open the [e2b-cookbook/guides/openai-assistant-py](./) directory
3. Install dependencies:
```sh
poetry install
```
4. Rename `.env.example` to `.env` and set up the `OPENAI_API_KEY` key and the `E2B_API_KEY` key. You can get `E2B_API_KEY` at  https://e2b.dev/docs/getting-started/api-key
5. Run `poetry run create-ai-assistant` if you don't have an assistant yet
6. Get the assistant ID from the console output and set it in the `.env` file as `AI_ASSISTANT_ID`
7. Start the app:
```sh
poetry run start
```
