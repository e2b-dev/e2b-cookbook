import os

from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()

api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    raise SystemExit("Set ANTHROPIC_API_KEY in .env")

# The prebuilt "claude" template ships a current Claude Code.
# template.py and the build scripts are only needed for a custom template.
# The with block kills the sandbox even when the run fails.
with Sandbox.create("claude", envs={"ANTHROPIC_API_KEY": api_key}) as sbx:
    print("Sandbox created", sbx.sandbox_id)

    # Print help for Claude Code
    # result = sbx.commands.run('claude --help')
    # print(result.stdout)

    # Run a prompt with Claude Code
    result = sbx.commands.run(
        "echo 'Create a hello world index.html' | claude -p --dangerously-skip-permissions",
        cwd="/home/user",
        timeout=0,
    )
    print(result.stdout)
