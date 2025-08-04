# Anthropic Claude Code in E2B Sandbox (Python)

This example shows how to run Anthropic's [Claude Code](https://github.com/anthropics/claude-code) in E2B Sandbox.

## How to create sandbox with Claude

We prepared a sandbox template with Claude Code already installed. You can create a sandbox with Claude by running the following code:

```python
from e2b import Sandbox

sbx = Sandbox("anthropic-claude-code", timeout=60 * 5) # Timeout set to 5 minutes, you can customize it as needed.

result = sbx.commands.run("claude --help")
print(result.stdout)
```

---

## How to run example

**1. Set API key E2B_API_KEY**

Set the `E2B_API_KEY` in `.env`. You can get the API key at [https://e2b.dev/dashboard](https://e2b.dev/dashboard)

```
E2B_API_KEY="..."
```

**2. Initialize the virtual environment**

```
uv venv
```

**3. Activate the virtual environment**

macOS/Unix

```
source .venv/bin/activate
```

Windows

```
.venv\Scripts\activate
```

**4. Run the example**

```
uv run src/anthropic_claude_code_in_sandbox_python/main.py
```
