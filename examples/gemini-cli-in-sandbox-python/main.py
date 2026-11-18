import os
import sys

from dotenv import load_dotenv
from e2b import CommandExitException, Sandbox

load_dotenv()

if not os.getenv("GEMINI_API_KEY"):
    sys.exit("Set GEMINI_API_KEY")

# Gemini CLI reads GEMINI_MODEL; without it, the CLI picks its default model
envs = {"GEMINI_API_KEY": os.environ["GEMINI_API_KEY"]}
if os.getenv("GEMINI_MODEL"):
    envs["GEMINI_MODEL"] = os.environ["GEMINI_MODEL"]

REPO = "/home/user/repo"

sbx = Sandbox.create("gemini", envs=envs, timeout=10 * 60)
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

    # --skip-trust: a fresh sandbox folder is not trusted, and headless runs exit without it.
    # Agent runs can take minutes, so disable the command timeout.
    sbx.commands.run(
        'gemini --skip-trust --yolo -p "The test in test_calc.py fails. Fix the bug in calc.py and run the test."',
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
finally:
    sbx.kill()
