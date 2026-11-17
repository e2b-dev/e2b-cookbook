# OpenAI Codex in E2B Sandbox (Python)

This example shows how to run OpenAI's [Codex](https://github.com/openai/codex) in E2B Sandbox.

## How to create sandbox with Codex
We prepared a sandbox template with Codex already installed. You can create a sandbox with Codex by running the following code:

```python
import os

from e2b import Sandbox

sbx = Sandbox.create(
    "codex",
    envs={
        # Codex reads an OpenAI API key from CODEX_API_KEY.
        "CODEX_API_KEY": os.environ["CODEX_API_KEY"],
    },
    # Timeout set to 5 minutes, you can customize it as needed.
    timeout=60 * 5,
)

# Print help for Codex
# result = sbx.commands.run('codex --help', request_timeout=0, timeout=0)
# print(result.stdout)

# Run a prompt with Codex
result = sbx.commands.run(
    "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 'Create a hello world index.html'",
    # Codex can run for a long time, so we need to set the timeout to 0.
    timeout=0,
)
print(result.stdout)

sbx.kill()
```

---

## How to run example

**1. Set API keys**

Set `E2B_API_KEY` and `CODEX_API_KEY` (an OpenAI API key) in `.env`. `OPENAI_API_KEY` works too. You can get the E2B API key at [https://e2b.dev/dashboard](https://e2b.dev/dashboard)
```
E2B_API_KEY="..."
CODEX_API_KEY="..."
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
uv run src/openai_codex_in_sandbox_python/main.py
```


