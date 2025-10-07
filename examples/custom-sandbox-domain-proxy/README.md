# Custom Sandbox Domain Proxy

Example of mapping custom subdomains to your E2B sandboxes. Access sandboxes at `my-app.yourdomain.com` instead of default URLs.

## Tech Stack
- [E2B Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter)
- Express.js

## How It Works
1. Create E2B sandbox, start Python HTTP server inside (port 8000)
2. Generate custom subdomain (e.g., `happy-blue-tiger`)
3. Map subdomain → sandbox ID in `sandboxCustomSubdomains` object
4. Express proxy extracts subdomain from requests, looks up sandbox ID, forwards to E2B sandbox
5. Works with any domain (`.localhost` for dev, your domain in production)

## Setup
### 1. Set up API keys
- Copy `.env.template` to `.env`
- Get your [E2B API KEY](https://e2b.dev/docs/getting-started/api-key) and add it to `.env`

### 2. Install packagesInstall the E2B Code Interpreter SDK and other dependencies

```bash
npm i
```

### 3. Run the example
```bash
npm run start
```

This creates a sandbox, assigns it a custom subdomain, starts the proxy on port 3000, and opens your browser.

Press `Ctrl+C` to stop and cleanup.

## Use Cases
- Branded URLs instead of random IDs
- Multi-tenant apps: one subdomain per user (`user-123.yourapp.com`)
- Named environments: dev/staging/prod

## Learn More
[E2B Documentation](https://e2b.dev/docs)
