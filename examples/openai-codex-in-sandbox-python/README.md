# OpenAI Codex in E2B Sandbox (Python)

This example shows how to run OpenAI's [Codex](https://github.com/openai/codex) in E2B Sandbox.

## How to create sandbox with Codex
We prepared a sandbox template with Codex already installed. You can create a sandbox with Codex by running the following code:

```python
from e2b import Sandbox

sbx = Sandbox("openai-codex", timeout=60 * 5) # Timeout set to 5 minutes, you can customize it as needed.

result = sbx.commands.run("codex --help")
print(result.stdout)
```

---

## How to run example

**1. Set up E2B_API_KEY environment variable in `.env` file.**

**2. Initialize the virtual environment**
`uv venv`

**3. Activate the virtual environment**
`source .venv/bin/activate`  # On Unix/macOS
or

`.venv\Scripts\activate`  # On Windows

**4. Install the dependencies**
`uv pip install`

**5. Run the script**
`uv run src/openai_codex_in_sandbox_python/main.py`

