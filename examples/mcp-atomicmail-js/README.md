# Atomic Mail MCP Example

This example gives an agent running in an E2B sandbox its **own email inbox**
using the [Atomic Mail](https://atomicmail.ai) MCP server. The agent registers
an `@atomicmail.ai` address by itself, then sends and receives mail over
[JMAP](https://www.rfc-editor.org/rfc/rfc8620.html) — no human setup, no
CAPTCHA, and no Atomic Mail API key.

## Features

- Run the Atomic Mail stdio MCP server (`@atomicmail/mcp`) inside an E2B sandbox
  via E2B's MCP gateway
- Register a fresh inbox with a **proof-of-work** signup (no human, no CAPTCHA)
- Send an email using a bundled JMAP preset
- Poll the inbox and read the message back

## Why this is useful

Autonomous agents routinely get stuck at "please verify your email." Atomic Mail
removes that wall: an agent signs itself up in ~30 seconds and owns a real,
deliverable inbox end to end. That unlocks workflows like email verification,
newsletter digests, support inboxes, and async email surveys — all without a
human in the loop.

## Setup

1. Copy the environment template:
   ```bash
   cp env.template .env
   ```

2. Fill in your API key in `.env`:
   ```
   E2B_API_KEY=your_e2b_api_key
   ```
   Atomic Mail needs no key — the agent registers its own inbox via
   proof-of-work. Optionally set `ATOMIC_MAIL_USERNAME` or `RECIPIENT_EMAIL`
   (see `env.template`).

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run the example:
   ```bash
   npm start
   ```

## What it does

1. Creates an E2B sandbox and runs the Atomic Mail MCP server (`@atomicmail/mcp`)
   through E2B's MCP gateway, exposing the `register`, `jmap_request`, and `help`
   tools over authenticated HTTP.
2. Calls `register` to create a new `@atomicmail.ai` inbox via proof-of-work.
3. Calls `jmap_request` with the bundled `send_mail` preset to send an email
   (to the agent's own inbox by default, so we can also demonstrate receiving).
4. Polls the inbox with the `list_inbox` preset until the message arrives and
   prints it.

## Learn more

- [E2B Documentation](https://e2b.dev/docs)
- [Atomic Mail](https://atomicmail.ai) · [Docs](https://atomic-mail.github.io/atomic-mail-agentic/) · [GitHub](https://github.com/Atomic-Mail/atomic-mail-agentic)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [JMAP (RFC 8620)](https://www.rfc-editor.org/rfc/rfc8620.html)
