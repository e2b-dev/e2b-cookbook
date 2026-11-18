import os
import secrets
import time
import urllib.request

from dotenv import load_dotenv
from e2b import CommandExitException, Sandbox
from openhands.sdk import LLM, Conversation, Workspace
from openhands.sdk.conversation.response_utils import get_agent_final_response
from openhands.tools.preset.default import get_default_agent
from pydantic import SecretStr

load_dotenv()

model = os.getenv("LLM_MODEL") or "openai/gpt-5.6-luna"
llm_api_key = os.getenv("LLM_API_KEY") or os.environ["OPENAI_API_KEY"]

REPO = "/home/user/repo"
# Only this script talks to the agent server, so it uses a random key and never prints it
server_key = secrets.token_urlsafe(32)

sbx = Sandbox.create("openhands", timeout=15 * 60)
print("Sandbox created", sbx.sandbox_id)

try:
    # A tiny project with a failing test
    sbx.files.write(f"{REPO}/calc.py", "def add(a, b):\n    return a - b\n")
    sbx.files.write(
        f"{REPO}/test_calc.py",
        "import unittest\n\nfrom calc import add\n\n\nclass TestAdd(unittest.TestCase):\n"
        "    def test_add(self):\n        self.assertEqual(add(2, 3), 5)\n\n\n"
        'if __name__ == "__main__":\n    unittest.main()\n',
    )
    sbx.commands.run(
        "git init -q && git add . && git -c user.name=demo -c user.email=demo@example.com commit -qm init",
        cwd=REPO,
    )

    # Start the OpenHands Agent Server without the Agent Canvas UI
    server = sbx.commands.run(
        "agent-canvas --backend-only --public > /tmp/agent-canvas.log 2>&1",
        background=True,
        timeout=0,
        envs={"LOCAL_BACKEND_API_KEY": server_key},
    )
    server.disconnect()

    host = f"https://{sbx.get_host(8000)}"
    ready = time.monotonic() + 3 * 60
    while True:
        try:
            urllib.request.urlopen(f"{host}/health", timeout=5)
            break
        except OSError:
            if time.monotonic() > ready:
                raise RuntimeError("Agent server did not start:\n" + sbx.files.read("/tmp/agent-canvas.log"))
            time.sleep(2)

    # The agent server runs the agent and its tools inside the sandbox; the model key goes with the agent spec
    llm = LLM(usage_id="agent", model=model, api_key=SecretStr(llm_api_key))
    agent = get_default_agent(llm=llm, cli_mode=True)
    workspace = Workspace(host=host, api_key=server_key, working_dir=REPO)
    conversation = Conversation(agent=agent, workspace=workspace, visualizer=None)
    conversation.send_message("The test in test_calc.py fails. Fix the bug in calc.py and run the test.")
    conversation.run(timeout=10 * 60)  # blocks until the agent stops
    print(f"Agent {conversation.state.execution_status.value}: {get_agent_final_response(conversation.state.events)}")
    conversation.close()

    diff = sbx.commands.run("git diff", cwd=REPO)
    print("\n--- git diff ---\n" + diff.stdout)

    try:
        sbx.commands.run("python3 -m unittest -q test_calc", cwd=REPO)
        print("Test passes after the fix.")
    except CommandExitException as err:
        print(f"Test still fails:\n{err.stderr}")
        raise SystemExit(1)
finally:
    sbx.kill()
