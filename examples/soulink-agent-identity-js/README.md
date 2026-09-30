# Soulink Agent Identity for E2B Sandboxes

This example shows how to give [E2B Sandbox](https://e2b.dev/docs/quickstart) agents verified on-chain identities using [Soulink](https://soulink.dev).

Sandbox agents are ephemeral and anonymous by default. Soulink gives them persistent, verifiable `.agent` names on Base — the identity outlives the sandbox, and reputation accrues across sessions.

## What this does

1. Resolves an agent's `.agent` identity from Soulink before sandbox creation
2. Checks the agent's on-chain credit score (reputation based on peer reports)
3. Injects identity context into the sandbox so code inside knows "who it is"
4. Demonstrates verifying another agent's identity from within the sandbox

## Setup & run

### 1. Install dependencies
```
npm install
```

### 2. Set up `.env`

1. Copy `.env.template` to `.env`
2. Get [E2B API key](https://e2b.dev/docs/getting-started/api-key)

### 3. Run the example
```
npm run start
```

## Learn more

- [Soulink API docs](https://soulink.dev/skill.md)
- [Register a .agent name](https://soulink.dev)
- [E2B Documentation](https://e2b.dev/docs)
