# Anthropic Claude Code in E2B Sandbox (Python)

This example shows how to run Anthropic's [Claude Code](https://github.com/anthropics/claude-code) in E2B Sandbox.

## How to create sandbox with Claude Code

We prepared a sandbox template with Claude Code already installed. You can create a sandbox with Claude by running the following code:

```python
from e2b import Sandbox

sbx = Sandbox(
    "anthropic-claude-code",
    # You can get your API key from Anthropic Console.
    envs={
        'ANTHROPIC_API_KEY': '<your api key>',
    },
    # Timeout set to 5 minutes, you can customize it as needed.
    timeout=60 * 5,
)

# Print help for Claude Code
# result = sbx.commands.run('claude --help')
# print(result.stdout)

# Run a prompt with Claude Code
result = sbx.commands.run(
    "echo 'Create a hello world index.html' | claude -p --dangerously-skip-permissions",
    # Claude Code can run for a long time, so we need to set the timeout to 0.
    timeout=0,
)
print(result.stdout)

sbx.kill()
```

---

## How to run example

**1. Set API key E2B_API_KEY**

Set the `E2B_API_KEY` in `.env`. You can get the API key at [https://e2b.dev/dashboard](https://e2b.dev/dashboard)

```
E2B_API_KEY="..."
```

**2. Change ANTHROPIC_API_KEY in the code**

Replace `<your api key>` in the code with your actual Anthropic API key.

**3. Initialize the virtual environment**

```
python -m venv .venv
```

**4. Activate the virtual environment**

macOS/Unix

```
source .venv/bin/activate
```

Windows

```
.venv\Scripts\activate
```

**5. Install dependencies**

```
pip install -e .
```

**6. Run the example**

```
python anthropic_claude_code_in_sandbox/main.py
```
