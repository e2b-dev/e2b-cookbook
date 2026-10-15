"""The exec_py runtime. It runs inside the E2B desktop, never on your machine.

code_exec.py uploads this file and starts it once per desktop. It listens on a Unix socket; each POST body is Python
source that runs in one shared namespace, so variables persist across calls. The code gets `pyautogui`, `time`,
`log(value)` and `display(image)`. The response is the JSON list of `input_text` and `input_image` items that the
Responses API takes as a `function_call_output`, so the host passes it through unchanged.

Adapted from the PyAutoGUI worker in OpenAI's CUA sample app (github.com/openai/openai-cua-sample-app).
"""

import base64
import contextlib
import io
import json
import os
import socketserver
import time
import traceback
from http.server import BaseHTTPRequestHandler

import pyautogui
import pyscreeze
from PIL import Image

# pyscreeze uses Pillow's in-memory grab only when it finds gnome-screenshot, which Pillow needs only on Wayland.
# The desktop runs X11, where Pillow grabs the screen itself.
pyscreeze.GNOMESCREENSHOT_EXISTS = True

SOCKET = "/tmp/exec_py.sock"
MAX_TEXT_BYTES = 60 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024

namespace = {"__builtins__": __builtins__, "pyautogui": pyautogui, "time": time}


def execute(code: str) -> list:
    """Run one exec_py call and collect what it logs and displays."""
    output = []
    text_bytes = image_bytes = 0

    def log(*values):
        nonlocal text_bytes
        text = " ".join(str(value) for value in values)
        text_bytes += len(text.encode())
        if text_bytes > MAX_TEXT_BYTES:
            raise ValueError("exec_py text output exceeds 60 KiB.")
        output.append({"type": "input_text", "text": text})

    def display(image):
        nonlocal image_bytes
        if isinstance(image, Image.Image):
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            image = buffer.getvalue()
        if not isinstance(image, bytes) or not image.startswith(b"\x89PNG"):
            raise TypeError("display expects a Pillow image or PNG bytes.")
        image_bytes += len(image)
        if image_bytes > MAX_IMAGE_BYTES:
            raise ValueError("exec_py image output exceeds 8 MiB.")
        output.append({"type": "input_image", "detail": "original",
                       "image_url": "data:image/png;base64," + base64.b64encode(image).decode()})

    class Writer:
        def write(self, text):
            if text.strip():
                log(text.rstrip())
            return len(text)

        def flush(self):
            pass

    namespace.update(log=log, display=display)
    try:
        with contextlib.redirect_stdout(Writer()), contextlib.redirect_stderr(Writer()):
            exec(compile(code, "<exec_py>", "exec"), namespace)  # noqa: S102 - model code, isolated in the sandbox
    except BaseException:  # noqa: BLE001 - report any error and keep the namespace so the model can fix its code
        output.append({"type": "input_text", "text": traceback.format_exc()[-4000:]})
    return output or [{"type": "input_text", "text": "exec_py completed with no output."}]


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        code = self.rfile.read(int(self.headers["Content-Length"])).decode()
        body = json.dumps(execute(code)).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class UnixHTTPServer(socketserver.UnixStreamServer):
    def get_request(self):
        # BaseHTTPRequestHandler expects a (host, port) client address.
        request, _ = super().get_request()
        return request, ("local", 0)


if os.path.exists(SOCKET):
    os.remove(SOCKET)
with UnixHTTPServer(SOCKET, Handler) as server:
    server.serve_forever()
