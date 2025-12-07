# my-template - E2B Sandbox Template

This is an E2B sandbox template that allows you to run code in a controlled environment.

## Prerequisites

Before you begin, make sure you have:
- An E2B account (sign up at [e2b.dev](https://e2b.dev))
- Your E2B API key (get it from your [E2B dashboard](https://e2b.dev/dashboard))
- Node.js and npm/yarn (or similar) installed

## Configuration

1. Copy `.env.example` and fill values:
   ```
   cp .env.example .env
   # edit .env to set E2B_API_KEY, E2B_DOMAIN, etc.
   ```
   The CLI auto-loads `.env` via `dotenv`, no need to `export`.

### Private Deployment

For private/self-hosted E2B deployments, configure these environment variables:

```
# Authentication
E2B_API_KEY=your_api_key_here

# Domain
E2B_DOMAIN=your.domain.tld
```

You can also export variables in your shell if you prefer, but using `.env` is recommended.

- Do not disable TLS verification (NODE_TLS_REJECT_UNAUTHORIZED=0) in production. Use valid certificates for your domain.
- You can also pass these via CLI options where supported, but environment variables are recommended.

## Installing Dependencies

```bash
npm install
```

## Building the Template

```bash
# Build (alias is required; no default)
npm run e2b:build:template -- --alias=<template_alias>
```

## Using the Template in a Sandbox

Once your template is built, you can use it in your E2B sandbox:

```typescript
import { Sandbox } from 'e2b'

// Create a new sandbox instance
const sandbox = await Sandbox.create('my-template')

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

Notes:
- Alias is required for build and for creating a sandbox.
- You can optionally set `--minutes` for TTL; shell mode works without it.

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

- `template.ts` - Defines the sandbox template configuration
- `build.template.ts` - Builds the template
- `operate.sandbox.ts` - CLI script for create/connect/shell/list/info/kill/pause/resume

## Purpose

This repository is a demonstration program using the E2B JavaScript SDK to operate sandboxes on private deployments or the official E2B platform. It focuses on:
- Build a template with a user-provided alias
- Create and connect to sandboxes
- Enter interactive shells
- List, inspect, pause, resume, and kill sandboxes

For private deployments, ensure environment variables are set as described above (e.g., `E2B_DOMAIN`). For testing with self-signed certificates, you may temporarily use `NODE_TLS_REJECT_UNAUTHORIZED=0`.
For official E2B SaaS, you only need `E2B_API_KEY`.

## Next Steps

1. Customize the template in `template.ts` to fit your needs
2. Build the template using one of the methods above
3. Use the template in your E2B sandbox code
4. Check out the [E2B documentation](https://e2b.dev/docs) for more advanced usage
5. For private deployments, ensure E2B_DOMAIN is correctly set and certificates are trusted
