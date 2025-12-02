# E2B Custom Sandbox Domain Proxy (Python)

This example demonstrates how to create a proxy server that maps custom subdomains to E2B sandboxes, allowing you to access sandbox services through user-friendly URLs.

## Features

- Creates an E2B sandbox with a Python HTTP server
- Generates a random custom subdomain for easy access
- Proxies requests from the custom subdomain to the sandbox
- Automatically opens the browser to the custom subdomain
- Handles cleanup on exit

## Prerequisites

- Python 3.9 or higher
- Poetry (install from https://python-poetry.org/docs/#installation)
- E2B API key (get yours at https://e2b.dev/docs)

## Setup

1. Install dependencies:
```bash
poetry install
```

2. Create a `.env` file from the template:
```bash
cp .env.example .env
```

3. Edit `.env` and add your E2B API key:
```
E2B_API_KEY=your_actual_api_key_here
```

## Usage

Run the proxy server:

```bash
poetry run python main.py
```

The script will:
1. Create a new E2B sandbox
2. Start a Python HTTP server inside the sandbox
3. Generate a random custom subdomain (e.g., `happy-blue-panda`)
4. Start a proxy server on port 80 (or the port specified in `.env`)
5. Open your browser to `http://<custom-subdomain>.localhost/`

## Configuration

You can customize the behavior using environment variables in `.env`:

- `E2B_API_KEY`: Your E2B API key (required)
- `PORT_IN_SANDBOX`: Port for the HTTP server inside the sandbox (default: 8000)
- `PORT`: Port for the proxy server (default: 80)

## How it Works

1. The script creates an E2B sandbox and starts a Python HTTP server inside it
2. A Flask proxy server runs locally and maps custom subdomains to sandbox IDs
3. When you access `http://<subdomain>.localhost/`, the proxy forwards your request to the sandbox
4. The sandbox's HTTP server serves files and the response is proxied back to your browser

## Cleanup

Press `Ctrl+C` to stop the server. The script will automatically clean up the sandbox.
