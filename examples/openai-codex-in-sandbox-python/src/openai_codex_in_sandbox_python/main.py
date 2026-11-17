import os

from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()

# The prebuilt "codex" template ships a current Codex CLI.
template_name = 'codex'
sbx = Sandbox.create(
    template_name,
    envs={
        # Codex reads an OpenAI API key from CODEX_API_KEY.
        "CODEX_API_KEY": os.getenv("CODEX_API_KEY") or os.getenv("OPENAI_API_KEY"),
    },
)
print("Sandbox created", sbx.sandbox_id)

# Print help for Codex
# result = sbx.commands.run('codex --help', request_timeout=0, timeout=0)
# print(result.stdout)

# Run a prompt with Codex
result = sbx.commands.run(
    "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 'Create a hello world index.html'",
    timeout=0,
)
print(result.stdout)

sbx.kill()
