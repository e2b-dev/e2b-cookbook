"""Test a web app running in an E2B sandbox with a Browser Use cloud browser.

The app is served from inside the sandbox and exposed on its public URL. A
Browser Use cloud browser opens that URL, and this script drives it with
Playwright over CDP: it reads the to-do list, adds a to-do and checks the count.
"""

from pathlib import Path

from browser_use_sdk.v4 import BrowserUse
from dotenv import load_dotenv
from e2b import Sandbox
from playwright.sync_api import sync_playwright

load_dotenv()

PORT = 8000
APP_DIR = "/home/user/app"
OUTPUT_DIR = Path(__file__).parent / "output"
# Hard stop for the cloud browser, in minutes, in case the script dies before
# it calls browsers.stop().
BROWSER_TIMEOUT_MINUTES = 10

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


def check_app(cdp_url: str, url: str) -> None:
    """Drive the cloud browser with Playwright over CDP and check the app."""
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(cdp_url)
        # Reuse the browser's existing context so its managed settings apply.
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()

        page.goto(url)
        todos = page.locator("#todos li").all_inner_texts()
        print(f"Playwright saw '{page.title()}' with to-dos: {todos}")

        page.fill("#title", "Ship the E2B example")
        page.click("button[type=submit]")
        count = page.locator("#count").inner_text()
        print(f"After adding a to-do the page shows: {count}")
        if count != "3 to-dos":
            raise RuntimeError(f"Expected '3 to-dos', got '{count}'")

        OUTPUT_DIR.mkdir(exist_ok=True)
        page.screenshot(path=OUTPUT_DIR / "app.png")
        print(f"Screenshot saved to {OUTPUT_DIR / 'app.png'}")


def main() -> None:
    sandbox = Sandbox.create(timeout=300)
    print(f"Created sandbox {sandbox.sandbox_id}")

    try:
        url = start_app(sandbox)
        print(f"App is live at {url}")

        with BrowserUse() as client:
            session = client.browsers.create(timeout=BROWSER_TIMEOUT_MINUTES)
            try:
                if not session.cdp_url:
                    raise RuntimeError("The browser did not return a CDP URL")
                print(f"Watch the browser live: {session.live_url}")
                check_app(session.cdp_url, url)
            finally:
                # Closing the CDP connection does not stop the browser. Stop it
                # explicitly so it is no longer billed.
                client.browsers.stop(session.id)
                print("Browser stopped")
    finally:
        sandbox.kill()
        print("Sandbox killed")


if __name__ == "__main__":
    main()
