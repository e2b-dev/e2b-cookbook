# DaoXE + E2B Code Interpreter (TypeScript)

Use [DaoXE](https://daoxe.com) as the LLM backend and the [E2B Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter) to run model-generated Python in a secure sandbox.

DaoXE is a **multi-model, multi-protocol** API gateway. This example uses the **OpenAI-compatible Chat Completions** surface via the official OpenAI SDK with a custom base URL:

```text
https://daoxe.com/v1
```

DaoXE also exposes other protocols (including **OpenAI Responses** and **Anthropic Messages / Claude protocol**) and multiple model families from its live catalog. This sample only demonstrates the OpenAI SDK path for easy migration; it is not OpenAI-only or Claude-only.

> **Availability:** DaoXE is **not offered in mainland China**. Use account-visible model IDs from your own DaoXE dashboard/catalog.

## Tech stack

- [E2B Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter)
- [OpenAI Node SDK](https://github.com/openai/openai-node) pointed at DaoXE
- TypeScript

## Setup

### 1. API keys

```bash
cp .env.template .env
```

Fill in:

| Variable | Where to get it |
| --- | --- |
| `E2B_API_KEY` | [E2B API key](https://e2b.dev/docs/getting-started/api-key) |
| `DAOXE_API_KEY` | [daoxe.com](https://daoxe.com) dashboard |
| `DAOXE_MODEL` | Exact model ID from **your** DaoXE account catalog |

Optional: `DAOXE_BASE_URL` (defaults to `https://daoxe.com/v1`).

### 2. Install

```bash
npm i
```

### 3. Run

```bash
npm start
```

The model should call the `execute_python` tool; E2B runs the code and may write `height_distribution.png` if a chart is produced.

## Notes

- Always set `DAOXE_MODEL` to an **exact** ID from your account; IDs and availability change.
- Prefer env vars over hardcoding keys or model IDs.
- For Anthropic Messages / Claude protocol clients, use DaoXE’s Messages endpoints instead of this OpenAI SDK sample.

## Learn more

- [DaoXE](https://daoxe.com)
- [E2B docs](https://e2b.dev/docs)
- Discord: [E2B community](https://discord.com/invite/U7KEcGErtQ)
