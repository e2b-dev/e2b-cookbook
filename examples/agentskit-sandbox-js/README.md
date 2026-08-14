# AgentsKit Sandbox with E2B

This example runs JavaScript and Python through the AgentsKit sandbox abstraction backed by E2B. It demonstrates explicit timeouts, structured output handling, and reliable sandbox cleanup without requiring a model provider.

## Tech stack

- [E2B Code Interpreter](https://e2b.dev/docs/code-interpreting)
- [`@agentskit/sandbox`](https://www.agentskit.io/docs/reference/packages/sandbox)
- TypeScript

## Setup

1. Copy `.env.template` to `.env`.
2. Add an [E2B API key](https://e2b.dev/docs/getting-started/api-key) to `E2B_API_KEY`.
3. Install dependencies and run the example:

```sh
npm install
npm run start
```

The process executes one JavaScript calculation and one Python calculation in the same E2B sandbox. Each result includes standard output, standard error, exit code, and duration. The `finally` block always disposes of the sandbox.

## Validate

```sh
npm run check
```
