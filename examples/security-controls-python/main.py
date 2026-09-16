import json
import os
import sys

import httpx
from e2b import Sandbox


def check(condition: bool, message: str) -> None:
    # Keep checks active even when Python is run with -O.
    if not condition:
        raise RuntimeError(message)


def offline_task() -> None:
    # Run this SDK client on your trusted backend. Keep E2B_API_KEY outside the guest.
    sandbox = Sandbox.create(
        secure=True,
        allow_internet_access=False,
        network={"allow_public_traffic": False},
        timeout=60,
    )
    try:
        sandbox.files.write("/home/user/input.json", json.dumps([10, 20, 30]))
        sandbox.files.write("/home/user/task.py", """
import json
from pathlib import Path

values = json.loads(Path('/home/user/input.json').read_text())
Path('/home/user/result.json').write_text(json.dumps({'total': sum(values)}))
""")
        sandbox.commands.run("python3 /home/user/task.py", timeout=10)
        result = json.loads(sandbox.files.read("/home/user/result.json"))
        check(result == {"total": 60}, "Unexpected task result")
        print('PASS offline task: result is {"total":60}')
    finally:
        sandbox.kill()


def restricted_service() -> None:
    sandbox = Sandbox.create(
        secure=True,
        allow_internet_access=False,
        network={"allow_public_traffic": False},
        timeout=60,
    )
    try:
        # Return fixed data, without exposing files or echoing request credentials.
        sandbox.files.write("/home/user/server.py", """
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

server = HTTPServer(('0.0.0.0', 8080), Handler)
Path('/tmp/security-example-ready').touch()
server.serve_forever()
""")
        sandbox.commands.run("python3 /home/user/server.py", background=True)
        sandbox.commands.run(
            "while [ ! -f /tmp/security-example-ready ]; do sleep 0.1; done",
            timeout=10,
        )

        url = f"https://{sandbox.get_host(8080)}"
        token = sandbox.traffic_access_token
        check(bool(token), "Expected a traffic access token")
        cases = [
            ("missing token", None, 403),
            ("invalid token", "invalid-example-token", 403),
            ("valid token", token, 200),
        ]
        with httpx.Client(timeout=10, follow_redirects=False) as client:
            for label, supplied_token, expected_status in cases:
                headers = (
                    {"e2b-traffic-access-token": supplied_token}
                    if supplied_token else {}
                )
                response = client.get(url, headers=headers)
                check(response.status_code == expected_status, f"Unexpected status: {label}")
                if expected_status == 200:
                    check(response.json() == {"ok": True}, "Unexpected service response")
                print(f"PASS restricted service: {label} -> {response.status_code}")
    finally:
        sandbox.kill()


def main() -> None:
    if not os.environ.get("E2B_API_KEY"):
        raise RuntimeError("Set E2B_API_KEY in your environment")
    offline_task()
    restricted_service()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Avoid logging SDK/HTTP objects that could contain request credentials.
        print(f"Example failed: {type(error).__name__}", file=sys.stderr)
        sys.exit(1)
