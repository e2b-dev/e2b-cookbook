# Create an OpenAI assistant that uses E2B Sandbox

## How to start
1. Clone this repository
2. Open the [e2b-cookbook/guides/open-assistant-js](./) directory
3. Install dependencies:
```sh
npm install
```
4. Rename `.env.example` to `.env` and set up the `OPENAI_API_KEY` key and the `E2B_API_KEY` key. You can get `E2B_API_KEY` at  https://e2b.dev/docs/getting-started/api-key
5. Run `npm run create-ai-assistant` if you don't have an assistant yet
6. Get the assistant ID from the console output and set it in the `.env` file as `AI_ASSISTANT_ID`
7. Start the app:
```sh
npm start
```
