# E2B Sandbox Template (Python)

This is a Python implementation of an E2B sandbox template that allows you to run code in a controlled environment.

## Prerequisites

Before you begin, make sure you have:

* An E2B account (sign up at [e2b.dev](https://e2b.dev))
* An E2B API key (available from the [E2B Console](https://e2b.dev/dashboard))
* Python 3.8+ and pip

## Configuration

1. Copy `.env.example` and fill in the values:

   ```bash
   cp .env.example .env
   # Edit the .env file to set E2B_API_KEY, E2B_DOMAIN, etc.
   ```

   The script automatically loads the `.env` file via `python-dotenv`.

### Private Deployment

For private/self-hosted E2B deployments, configure the following environment variables:

```bash
# Authentication
E2B_API_KEY=your_api_key_here

# Domain (including port number)
E2B_DOMAIN=your.domain.tld:port

# Custom DNS resolution (optional)
# Use this if the domain needs to resolve to a specific IP address
E2B_CUSTOM_IP=192.168.123.84
```

You may export variables in the shell, but using a `.env` file is recommended.

**SSL Certificate Notes**:

* The script automatically detects private deployments (via the `E2B_DOMAIN` variable)
* SSL certificate verification is automatically disabled for private deployments
* If custom DNS resolution is needed, set the `E2B_CUSTOM_IP` variable
* For production environments, using valid SSL certificates is recommended

## Install Dependencies

```bash
pip install -r requirements.txt
```

## Build the Template

```bash
# 1. Build (requires alias)
python build_template.py --alias=<template_alias>

# 2. Specify mode (optional, default is 'code')
python build_template.py --alias=my-base-template --mode=base

# 3. Specify image registry (optional)
python build_template.py --alias=my-template --registry=hub.registry.com

# 4. Read configuration from environment variables (set them in the .env file)
# SANDBOX_MODE=base
# E2B_IMAGE_REGISTRY=hub.registry.com
python build_template.py --alias=my-template
```

## Use the Template in a Sandbox

After the template is built, you can use it inside an E2B sandbox:

```python
from e2b import Sandbox

# Create a new sandbox instance
sandbox = Sandbox.create('my-template')

# Sandbox is ready!
print('Sandbox created successfully')
```

## CLI Commands

### Create / Connect

```bash
# Create a new sandbox from an alias (alias required)
python operate_sandbox.py --alias=<template_alias>

# Connect to an existing sandbox
python operate_sandbox.py --connect --id=<sandboxID>

# Enter interactive shell (session persists until exit)
python operate_sandbox.py --connect --id=<sandboxID> --shell
python operate_sandbox.py --alias=<template_alias> --shell

# Upload a file and enter shell (file will appear in /home/user/)
python operate_sandbox.py --alias=<template_alias> --upload example_code.py --shell

# Upload multiple files and enter shell
python operate_sandbox.py --alias=<template_alias> --upload file1.py file2.py script.sh --shell

# Optional runtime duration (minutes)
python operate_sandbox.py --alias=<template_alias> --minutes=10
```

Notes:

* Both building and creating sandboxes require specifying an alias.
* You can optionally set TTL using `--minutes`; for shell mode, it’s optional.
* Using `--upload` uploads files to `/home/user/` immediately after sandbox creation.

### List / Info / Kill / Pause / Resume

```bash
# List sandboxes (ID, STATE, NAME, START AT, END AT)
python operate_sandbox.py --list

# Show sandbox details
python operate_sandbox.py --info --id=<sandboxID>

# Kill sandbox
python operate_sandbox.py --kill --id=<sandboxID>

# Pause sandbox
python operate_sandbox.py --pause --id=<sandboxID>

# Resume sandbox
python operate_sandbox.py --resume --id=<sandboxID>
```

### Code Execution

You can execute Python code, shell commands, or local Python files directly inside a sandbox:

```bash
# Execute Python code (create new sandbox)
python operate_sandbox.py --alias=<template_alias> --code='print("Hello from E2B!")'

# Execute Python code (connect to existing sandbox)
python operate_sandbox.py --connect --id=<sandboxID> --code='import sys; print(sys.version)'

# Execute a local Python file (recommended for multi-line code)
python operate_sandbox.py --alias=<template_alias> --file=your_script.py

# Execute a local Python file (connect to existing sandbox)
python operate_sandbox.py --connect --id=<sandboxID> --file=your_script.py

# Execute shell command (create new sandbox)
python operate_sandbox.py --alias=<template_alias> --command='ls -la'

# Execute shell command (connect to existing sandbox)
python operate_sandbox.py --connect --id=<sandboxID> --command='pwd && whoami'
```

Notes:

* `--code` runs Python code via `python3 -c`
* `--file` uploads and runs a local Python file from `/tmp/`
* `--command` runs a shell command
* Exit code, stdout, and stderr are displayed after execution
* The script exits using the executed program’s exit code

#### Multi-line Python Code Example

For complex multi-line code, use the `--file` parameter:

1. Create a Python file (e.g., `my_script.py`):

```python
import math

def fibonacci(n):
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b

result = [fibonacci(i) for i in range(10)]
print(f"Fibonacci sequence: {result}")

radius = 5
area = math.pi * radius ** 2
print(f"Area of a circle with radius {radius}: {area:.2f}")
```

2. Run the file:

```bash
python operate_sandbox.py --alias=<template_alias> --file=my_script.py
```

### Template Management

```bash
# List templates (ID, ALIASES, STATUS, BUILDS, CREATED/UPDATED/LAST USED)
python operate_sandbox.py --list-templates

# Delete template by ID
python operate_sandbox.py --delete-template --id=<templateID>

# Delete template by alias (automatically resolves to ID)
python operate_sandbox.py --delete-template --alias=<alias>
```

## Template Structure

* `template.py` — Defines sandbox template configuration
* `build_template.py` — Builds the template
* `operate_sandbox.py` — CLI script for create/connect/shell/list/info/kill/pause/resume

## Purpose

This repository demonstrates how to work with sandboxes using the E2B Python SDK on private deployments or the official E2B platform. It focuses on:

* Building templates using user-provided aliases
* Creating and connecting to sandboxes
* Launching interactive shells
* Listing, inspecting, pausing, resuming, and killing sandboxes

For private deployments, ensure environment variables such as `E2B_DOMAIN` are set correctly.
For the official E2B SaaS, only `E2B_API_KEY` is required.

## Next Steps

1. Customize the template in `template.py`
2. Build the template using one of the methods above
3. Use the template in your E2B sandbox code
4. Check out the [E2B documentation](https://e2b.dev/docs) for advanced usage
5. For private deployments, ensure `E2B_DOMAIN` is configured and certificates are trusted

## Differences from the JavaScript Version

This Python implementation provides the same functionality as the JavaScript version:

* Template definition and building
* Sandbox creation and management
* Interactive shell support
* Full CLI operations

Main differences:

* Uses Python’s `argparse` instead of manual CLI parsing
* Uses `termios` and `tty` for terminal control
* Loads environment variables via `python-dotenv`
* Python-style naming conventions (snake_case)

