"""Test a web app running in an E2B sandbox with a Notte cloud browser.

The app is served from inside the sandbox and exposed on its public URL. A Notte
browser then opens that URL twice: once from this script with Playwright over CDP,
and once from inside the sandbox with the Notte CLI, the way an agent running in
the sandbox would.
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from e2b import Sandbox
from notte_sdk import NotteClient

load_dotenv()

PORT = 8000
APP_DIR = "/home/user/app"
OUTPUT_DIR = Path(__file__).parent / "output"

# A small to-do app, standing in for whatever your agent builds in the sandbox.
APP_HTML = """<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Sandbox To-dos</title></head>
  <body style="font-family: sans-serif; max-width: 480px; margin: 40px auto">
    <h1>Sandbox To-dos</h1>
    <form id="add">
      <input id="title" name="title" placeholder="New to-do" aria-label="New to-do">
      <button type="submit">Add</button>
    </form>
    <ul id="todos">
      <li>Write the app</li>
      <li>Start the server</li>
    </ul>
    <p id="count">2 to-dos</p>
    <script>
      document.getElementById("add").addEventListener("submit", (event) => {
        event.preventDefault();
        const input = document.getElementById("title");
        if (!input.value.trim()) return;
        const item = document.createElement("li");
        item.textContent = input.value.trim();
        document.getElementById("todos").appendChild(item);
        const count = document.querySelectorAll("#todos li").length;
        document.getElementById("count").textContent = `${count} to-dos`;
        input.value = "";
      });
    </script>
  </body>
</html>
"""


def start_app(sandbox: Sandbox) -> str:
    """Serve the app from the sandbox and return its public URL."""
    sandbox.files.write(f"{APP_DIR}/index.html", APP_HTML)
    sandbox.commands.run(f"python3 -m http.server {PORT}", cwd=APP_DIR, background=True)
    # Wait until the server accepts connections before handing the URL to the browser.
    sandbox.commands.run(
        f"for i in $(seq 1 50); do curl -sf http://localhost:{PORT} > /dev/null && exit 0; sleep 0.2; done; exit 1"
    )
    return f"https://{sandbox.get_host(PORT)}"


def install_notte(sandbox: Sandbox) -> None:
    """Install the latest Notte CLI release and the Notte skill for coding agents."""
    sandbox.commands.run("curl -fsSL https://notte.cc/install-cli.sh | sh")
    # The skill installer needs Node 22, newer than the one in the default sandbox.
    sandbox.commands.run("sudo npx -y n 22", timeout=240)
    # Installs into ~/.agents/skills, where Claude Code, Codex and other agents pick it up.
    sandbox.commands.run("notte skill add --yes", cwd="/home/user", timeout=240)
    skills = sandbox.commands.run("ls /home/user/.agents/skills").stdout.split()
    print(f"Installed the Notte CLI and skills: {', '.join(skills)}")


def check_with_notte_cli(sandbox: Sandbox, url: str) -> None:
    """Drive a Notte browser from inside the sandbox with CLI commands."""
    envs = {"NOTTE_API_KEY": os.environ["NOTTE_API_KEY"]}
    session = json.loads(sandbox.commands.run("notte sessions start -o json", envs=envs).stdout)
    print(f"Notte CLI started session {session['session_id']}, watch it live: {session['viewer_url']}")

    commands = [
        f"notte page goto {url}",
        "notte page fill '#title' 'Ship the E2B example'",
        "notte page click 'button[type=submit]'",
        "notte page scrape --only-main-content",
        "notte sessions stop --yes",
    ]
    for command in commands:
        print(f"$ {command}")
        result = sandbox.commands.run(command, envs=envs)
        print(result.stdout.strip())


def main() -> None:
    notte = NotteClient()
    sandbox = Sandbox.create(timeout=300)
    print(f"Created sandbox {sandbox.sandbox_id}")

    try:
        url = start_app(sandbox)
        print(f"App is live at {url}")

        with notte.Session() as session:
            print(f"Watch the browser live: {session.response.viewer_url}")

            # session.page is a Playwright page connected to the Notte browser over CDP.
            page = session.page
            page.goto(url)
            todos = page.locator("#todos li").all_inner_texts()
            print(f"Playwright saw '{page.title()}' with to-dos: {todos}")
            OUTPUT_DIR.mkdir(exist_ok=True)
            page.screenshot(path=OUTPUT_DIR / "app.png")
            print(f"Screenshot saved to {OUTPUT_DIR / 'app.png'}")

        install_notte(sandbox)
        check_with_notte_cli(sandbox, url)
    finally:
        sandbox.kill()
        print("Sandbox killed")


if __name__ == "__main__":
    main()
