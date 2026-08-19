import os

from dotenv import load_dotenv
from e2b import Sandbox

from anthropic_claude_code_in_sandbox.template import template_name

load_dotenv()

sbx = Sandbox.create(
    template_name,
    envs={
        "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY"),
    },
)
print("Sandbox created", sbx.sandbox_id)

# Print help for Claude Code
# result = sbx.commands.run('claude --help')
# print(result.stdout)

# Run a prompt with Claude Code
result = sbx.commands.run(
    "echo 'Create a hello world index.html' | claude -p --dangerously-skip-permissions",
    timeout=0,
)
print(result.stdout)

sbx.kill()
