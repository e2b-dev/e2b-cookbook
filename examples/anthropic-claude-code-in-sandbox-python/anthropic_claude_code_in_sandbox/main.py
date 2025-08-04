from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()

template_name = 'anthropic-claude-code'
sbx = Sandbox(
    template_name,
    envs={
        'ANTHROPIC_API_KEY': '<your api key>',
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
