# E2B Sandbox Template (Code and Base Modes)

This example provides two sandbox template modes for E2B:
- Code Execution mode: based on `e2bdev/code-interpreter`, suitable for Python code execution via Jupyter.
- Base mode: based on `e2bdev/base`, suitable for general-purpose shell and tooling.

## Prerequisites

Before you begin, make sure you have:
- An E2B account (sign up at [e2b.dev](https://e2b.dev))
- Your E2B API key (get it from your [E2B dashboard](https://e2b.dev/dashboard))
- Node.js and npm/yarn (or similar) installed

## Configuration

1. Copy `.env.example` and fill values:
   ```
   cp .env.example .env
   ```
   Recommended variables:
   - `E2B_API_KEY` (required)
   - `E2B_DOMAIN` (optional, for private/self-hosted deployments)
   - `SANDBOX_MINUTES` (optional, TTL for sandbox sessions)
   - `SANDBOX_MODE` (optional, `code` or `base`, default `code`)
   - `E2B_IMAGE_REGISTRY` (optional, image registry prefix like `192.168.123.81:5000`)

### Private Deployment

For private/self-hosted E2B deployments, configure these environment variables:

```
# Authentication
E2B_API_KEY=your_api_key_here

# Domain
E2B_DOMAIN=your.domain.tld
```

You can also export variables in your shell if you prefer, but using `.env` is recommended.

## Install Dependencies

```bash
npm install
```

## Build Template

Choose the mode via CLI or environment variables.

```bash
# Code Execution mode (Jupyter & Code Interpreter)
npm run e2b:build:template -- --alias=my-code --mode=code

# Base mode (general-purpose shell)
npm run e2b:build:template -- --alias=my-base --mode=base

# With private image registry
npm run e2b:build:template -- --alias=my-code --mode=code --registry=192.168.123.81:5000
```

Environment alternatives:
- `SANDBOX_MODE=code|base`
- `E2B_IMAGE_REGISTRY=<host:port>`

## Use the Template

```ts
import { Sandbox } from 'e2b'

// Create a new sandbox instance
const sandbox = await Sandbox.create('my-base')

// Your sandbox is ready to use!
console.log('Sandbox created successfully')
```

## CLI Commands

### Create / Connect

```
# Create new sandbox from alias (alias is required)
npm run e2b:create:sandbox -- --alias=<template_alias>

# Connect to existing sandbox
npm run e2b:connect:sandbox -- --id=<sandboxID>

# Enter interactive shell (no time parameter required; session lasts until exit)
npm run e2b:connect:sandbox -- --id=<sandboxID> --shell
npm run e2b:create:sandbox -- --alias=<template_alias> --shell

# Optionally set runtime in minutes
npm run e2b:create:sandbox -- --minutes=10
```

### List / Info / Kill / Pause / Resume

```
# List sandboxes (ID, STATE, NAME, START AT, END AT)
npm run e2b:list:sandbox

# Show sandbox details
npm run e2b:info:sandbox -- --id=<sandboxID>

# Kill sandbox
npm run e2b:kill:sandbox -- --id=<sandboxID>

# Pause sandbox
npm run e2b:pause:sandbox -- --id=<sandboxID>

# Resume sandbox
npm run e2b:resume:sandbox -- --id=<sandboxID>
```

### Templates

```
# List templates (ID, ALIASES, STATUS, BUILDS, CREATED/UPDATED/LAST USED)
npm run e2b:list:template

# Delete template by ID
npm run e2b:delete:template -- --id=<templateID>

# Delete template by alias (auto resolves to ID)
npm run e2b:delete:template -- --alias=<alias>
```

## Template Structure

- `template.ts` – template factory supporting `code` and `base` modes
- `build.template.ts` – build script with `--mode` and `--registry` support
- `operate.sandbox.ts` – CLI for create/connect/shell/list/info/kill/pause/resume

## Code Interpreter Demo (Code Mode)

Run a quick Python snippet via Code Interpreter (only in `code` mode):

```
npm run e2b:run:code -- --alias=my-code --code="print('hello')"
```

## Notes

- For private deployments, set `E2B_DOMAIN` and ensure certificates are trusted.
- The `code` mode waits for Jupyter health at `http://localhost:49999/health`.
- The `base` mode starts with `sudo /bin/bash` and is ready for shell commands.
