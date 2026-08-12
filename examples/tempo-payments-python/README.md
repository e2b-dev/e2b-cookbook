# E2B + Tempo: Autonomous Agent Payments

This example shows how to run an AI agent inside an [E2B sandbox](https://e2b.dev) that can autonomously pay for API services using [Tempo's Machine Payments Protocol (MPP)](https://tempo.xyz).

The agent makes a paid web search request — Tempo handles the stablecoin payment automatically via HTTP 402 challenge-response.

## How it works

1. A custom sandbox template is built with Tempo CLI and pympp pre-installed
2. Your Tempo wallet keys are injected at runtime (never baked into the image)
3. The agent calls a paid API → Tempo handles the 402 payment → agent gets the response

## Setup & run

### 1. Install dependencies
```
poetry install
```

### 2. Set up Tempo wallet
```bash
curl -fsSL https://tempo.xyz/install | bash
tempo wallet login
tempo wallet fund
```

### 3. Set up `.env`
1. Copy `.env.template` to `.env`
2. Add your [E2B API key](https://e2b.dev/docs/getting-started/api-key)

### 4. Run the example
```
poetry run start
```

On first run, the template will be built automatically (~1-2 min). Subsequent runs use the cached template.

## Available services

100+ MPP-compatible services at [mpp.dev/services](https://mpp.dev/services) including web search, blockchain data, image generation, browser automation, and more.
