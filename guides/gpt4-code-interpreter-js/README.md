# Build Custom Code Interpreter with E2B and GPT-4
**This is a repo accompanying the [official E2B guide](TODO) on how to build your own custom code interpreter.**

## How to start
1. Clone this repository
2. Open the `e2b-cookbook/guides/gpt4-code-interpreter-js` directory
3. Install dependencies:
```sh
npm i
```
4. Get OpenAI API key at https://platform.openai.com
5. Get E2B API key at https://e2b.dev/docs/getting-started/api-key
6. Start the app:
```sh
OPENAI_API_KEY=<your-openai-api-key> E2B_API_KEY=<your-e2b-api-key> node index.js
```