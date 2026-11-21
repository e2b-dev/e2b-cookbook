# MCP PkgDiet Guardrails

This example demonstrates how to protect your E2B Sandbox from autonomous AI agents that hallucinate dependencies, recommend deprecated packages, or attempt to install malicious/bloated npm packages.

It uses the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) to connect to **PkgDiet**, a local security guardrail tool. Before the agent is allowed to execute `npm install` inside the E2B Sandbox, the request is intercepted and evaluated by PkgDiet via MCP.

## Prerequisites

1. Set your `E2B_API_KEY` in the `.env` file (copy from `.env.example`).
2. Have Node.js and `npm` installed locally.

## Running the Example

```bash
# 1. Install dependencies
npm install

# 2. Run the guardrail demonstration
npm start
```

## How it works

1. The script initializes a local MCP Client that connects to the PkgDiet MCP Server via `stdio`.
2. It simulates an AI agent requesting to install three different packages (`express`, `request`, and `colors.js`).
3. For each package, it calls the `check_dependency` MCP tool.
4. If PkgDiet returns a **BLOCK** verdict, the E2B Sandbox execution is aborted, protecting the environment.
5. If PkgDiet returns a **PASS** or **WARN** verdict, an E2B Sandbox is spawned and the package is safely installed.
