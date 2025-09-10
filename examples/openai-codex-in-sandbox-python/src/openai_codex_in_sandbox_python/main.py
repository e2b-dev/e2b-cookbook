from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()

template_name = 'openai-codex'
sbx = Sandbox(
    template_name,
    envs={
        "OPENAI_API_KEY": "<your api key>",
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
