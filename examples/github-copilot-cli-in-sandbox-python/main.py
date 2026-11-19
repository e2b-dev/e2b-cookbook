import os
import sys

from dotenv import load_dotenv
from e2b import CommandExitException, Sandbox

load_dotenv()


def copilot_envs() -> dict[str, str]:
    """A Copilot plan token, or your own OpenAI key through Copilot CLI's custom provider mode."""
    if os.getenv("COPILOT_GITHUB_TOKEN"):
        return {"COPILOT_GITHUB_TOKEN": os.environ["COPILOT_GITHUB_TOKEN"]}
    if os.getenv("OPENAI_API_KEY"):
        return {
            "COPILOT_PROVIDER_BASE_URL": "https://api.openai.com/v1",
            "COPILOT_PROVIDER_API_KEY": os.environ["OPENAI_API_KEY"],
            "COPILOT_PROVIDER_WIRE_API": "responses",
            "COPILOT_MODEL": "gpt-5.6-luna",
        }
    sys.exit("Set COPILOT_GITHUB_TOKEN or OPENAI_API_KEY")


REPO = "/home/user/repo"

sbx = Sandbox.create("copilot", envs=copilot_envs(), timeout=10 * 60)
print("Sandbox created", sbx.sandbox_id)

try:
    # A tiny project with a failing test
    sbx.files.write(f"{REPO}/calc.py", "def add(a, b):\n    return a - b\n")
    sbx.files.write(
        f"{REPO}/test_calc.py",
        'import unittest\n\nfrom calc import add\n\n\nclass TestAdd(unittest.TestCase):\n    def test_add(self):\n        self.assertEqual(add(2, 3), 5)\n\n\nif __name__ == "__main__":\n    unittest.main()\n',
    )
    sbx.commands.run(
        "git init -q && git add . && git -c user.name=demo -c user.email=demo@example.com commit -qm init",
        cwd=REPO,
    )

    # Agent runs can take minutes, so disable the command timeout
    sbx.commands.run(
        'copilot --allow-all-tools -s -p "The test in test_calc.py fails. Fix the bug in calc.py and run the test."',
        cwd=REPO,
        timeout=0,
        on_stdout=lambda data: print(data, end=""),
    )

    diff = sbx.commands.run("git diff", cwd=REPO)
    print("\n--- git diff ---\n" + diff.stdout)

    try:
        sbx.commands.run("python3 -m unittest -q test_calc", cwd=REPO)
        print("Test passes after the fix.")
    except CommandExitException as err:
        print(f"Test still fails:\n{err.stderr}")
        sys.exit(1)
finally:
    sbx.kill()
