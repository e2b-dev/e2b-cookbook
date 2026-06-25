"""
BrowseCLI in an E2B sandbox — Python runner.

Spins up the `browsecli-sandbox` E2B template, uploads the demo script, and runs
it. The script uses the `browse` CLI (baked into the template) to drive a
*remote* Verified Browserbase browser over CDP — residential IP, stealth
fingerprint, server-side CAPTCHA solving — and reach a Cloudflare-protected page
that a vanilla datacenter-IP sandbox browser would be blocked from.

The agent loop runs IN the sandbox; the browser runs ON Browserbase.

Run:
    pip install e2b python-dotenv
    e2b template build          # one-time: builds the image from e2b.Dockerfile
    python main.py

Required env (see env.template):
    E2B_API_KEY, BROWSERBASE_API_KEY
    Optional: TARGET_URL (default https://nowsecure.nl)
"""

import os
import pathlib
import sys

from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()

TEMPLATE = "browsecli-sandbox"  # matches template_name in e2b.toml
TARGET_URL = os.environ.get("TARGET_URL", "https://nowsecure.nl")


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required env var: {name}")
    return value


def main() -> None:
    require_env("E2B_API_KEY")  # read automatically by the SDK
    browserbase_api_key = require_env("BROWSERBASE_API_KEY")

    print(f'Creating E2B sandbox from template "{TEMPLATE}"...')
    sbx = Sandbox.create(TEMPLATE, timeout=600)  # 10 min

    try:
        print(f"Sandbox ready: {sbx.sandbox_id}")

        demo = pathlib.Path(__file__).with_name("browsecli-demo.sh").read_text()
        sbx.files.write("/home/user/browsecli-demo.sh", demo)
        sbx.commands.run("chmod +x /home/user/browsecli-demo.sh")

        print(f"Running BrowseCLI demo against {TARGET_URL} ...\n")
        result = sbx.commands.run(
            "/home/user/browsecli-demo.sh",
            envs={
                "BROWSERBASE_API_KEY": browserbase_api_key,
                "TARGET_URL": TARGET_URL,
            },
            on_stdout=lambda line: print(line, end=""),
            on_stderr=lambda line: print(line, end="", file=sys.stderr),
            timeout=300,
        )

        if result.exit_code != 0:
            raise SystemExit(f"Demo failed (exit {result.exit_code}).")
        print(
            "\n✅ Done — reached real content through a Verified Browserbase "
            "browser from inside E2B."
        )
    finally:
        sbx.kill()


if __name__ == "__main__":
    main()
