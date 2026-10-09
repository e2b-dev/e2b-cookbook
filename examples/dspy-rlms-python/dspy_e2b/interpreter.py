"""DSPy's synchronous CodeInterpreter contract over E2B commands and files."""

import asyncio
import contextvars
import hashlib
import inspect
import json
import keyword
import logging
import math
import queue
import sys
import threading
import time
import uuid
from importlib.resources import files

from dspy import CodeExecutionError, CodeInterpreterError, FinalOutput
from dspy.utils.callback import with_callbacks
from e2b import Sandbox

logger = logging.getLogger(__name__)
MAX_FRAME_BYTES = 8 * 1024 * 1024
MAX_INPUT_BYTES = 64 * 1024 * 1024
INLINE_INPUT_BYTES = 64 * 1024
INPUT_PATH = "/home/user/.dspy-inputs.json"
WORKER_PATH = "/home/user/.dspy-worker.py"


class E2BInterpreter:
    """One owned, network-off E2B sandbox per DSPy invocation.

    Host callables and model keys stay on the host. execute is synchronous;
    cancelling an async waiter does not terminate a running host callable.
    """

    execution_instructions = (
        "Code runs in persistent remote CPython on E2B, with sqlite3, subprocess and the standard library. "
        "Variables, imports and files persist within this invocation. Inputs are freshly assigned each step. "
        "No pandas/numpy, outbound network or package installation. "
        "Use SQLite for filtering and aggregation. "
        "Host tools and SUBMIT are global functions. Each execute has a deadline including host tools "
        "(60 seconds by default). All generated threads must finish before the code block ends."
    )

    def __init__(
        self, tools=None, output_fields=None, *, execution_timeout=60, sandbox_timeout=600, callbacks=None
    ):
        for name, value in (("execution_timeout", execution_timeout), ("sandbox_timeout", sandbox_timeout)):
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
                or value <= 0
            ):
                raise ValueError(f"{name} must be positive and finite")
        if sandbox_timeout < execution_timeout:
            raise ValueError("sandbox_timeout must be at least execution_timeout")
        self.tools = dict(tools or {})
        self.output_fields = output_fields
        self.callbacks = list(callbacks or [])
        self.execution_timeout = execution_timeout
        self.sandbox_timeout = sandbox_timeout
        self.session_id = uuid.uuid4().hex
        self._sandbox = self._handle = None
        self._sandbox_id = None
        self._reader = None
        self._responses = queue.Queue(maxsize=32)
        self._reader_error = self._tool_failure = None
        self._ended = False
        self._stop = threading.Event()
        self._execution_lock = threading.Lock()
        self._start_lock = threading.Lock()
        self._send_lock = threading.Lock()
        self._tool_slots = threading.BoundedSemaphore(8)
        self._cached_digest = None
        self._epoch = 0
        self._last_output = None
        self._failure = None
        self._validate({})

    @property
    def sandbox_id(self):
        return self._sandbox_id

    def _validate(self, variables):
        def valid(name):
            return isinstance(name, str) and name.isidentifier() and not keyword.iskeyword(name)

        reserved = {"SUBMIT", "__builtins__"}
        if any(
            not valid(name) or name in reserved or not callable(tool) for name, tool in self.tools.items()
        ):
            raise CodeInterpreterError("tools must map non-reserved Python identifiers to callables")
        if not isinstance(variables, dict) or any(
            not valid(name) or name in reserved or name in self.tools for name in variables
        ):
            raise CodeInterpreterError(
                "variables must use non-reserved identifiers and JSON-compatible values"
            )
        if self.output_fields is not None:
            if not isinstance(self.output_fields, list) or any(
                not isinstance(field, dict) or not valid(field.get("name")) for field in self.output_fields
            ):
                raise CodeInterpreterError("output_fields must contain Python field names")
            names = [field["name"] for field in self.output_fields]
            if len(set(names)) != len(names):
                raise CodeInterpreterError("output_fields must have unique names")

    def _active(self):
        if self._ended:
            raise CodeInterpreterError("E2B interpreter session ended; create a fresh interpreter")

    @with_callbacks
    def start(self):
        with self._start_lock:
            self._active()
            if self._handle is not None:
                return
            deadline = time.monotonic() + 40
            try:
                self._sandbox = Sandbox.create(
                    timeout=self.sandbox_timeout,
                    allow_internet_access=False,
                    metadata={"dspy_interpreter": "cookbook", "dspy_session": self.session_id},
                    request_timeout=20,
                )
                self._sandbox_id = self._sandbox.sandbox_id
                logger.info("E2B sandbox %s, dspy_session=%s", self.sandbox_id, self.session_id)
                self._active()
                self._sandbox.files.write(
                    WORKER_PATH, files("dspy_e2b").joinpath("_worker.py").read_text(), request_timeout=20
                )
                self._handle = self._sandbox.commands.run(
                    "python3 -u /home/user/.dspy-worker.py",
                    envs={"PIP_NO_INDEX": "1", "RES_OPTIONS": "timeout:1 attempts:1"},
                    background=True,
                    stdin=True,
                    timeout=0,
                    request_timeout=20,
                )
                self._reader = threading.Thread(target=self._read, daemon=True)
                self._reader.start()
                if self._receive(deadline) != {"type": "ready"}:
                    raise CodeInterpreterError("Invalid E2B worker startup message")
            except BaseException as exc:
                self._failure = exc
                self.shutdown()
                if isinstance(exc, (CodeInterpreterError, KeyboardInterrupt, asyncio.CancelledError)):
                    raise
                raise CodeInterpreterError("Unable to initialize E2B interpreter") from exc

    def _read(self):
        buffered = ""
        received = 0
        try:
            for stdout, stderr, _ in self._handle:
                if self._stop.is_set():
                    break
                if stderr:
                    raise CodeInterpreterError("E2B worker wrote outside the execution protocol")
                if not stdout:
                    continue
                received += len(stdout.encode("utf-8"))
                if received > MAX_INPUT_BYTES:
                    raise CodeInterpreterError("E2B session exceeded its 64 MiB response budget")
                buffered += stdout
                while "\n" in buffered:
                    line, buffered = buffered.split("\n", 1)
                    if len(line.encode("utf-8")) > MAX_FRAME_BYTES:
                        raise CodeInterpreterError("E2B response frame exceeds 8 MiB")
                    message = json.loads(line)
                    if not isinstance(message, dict) or not isinstance(message.get("type"), str):
                        raise CodeInterpreterError("Invalid E2B response frame")
                    self._responses.put(message, timeout=0.1)
                if len(buffered.encode("utf-8")) > MAX_FRAME_BYTES:
                    raise CodeInterpreterError("E2B response frame exceeds 8 MiB")
            if not self._stop.is_set():
                raise CodeInterpreterError("E2B worker stream ended; session state is lost")
        except BaseException as exc:
            if not self._stop.is_set():
                self._reader_error = exc
        finally:
            try:
                self._responses.put(None, timeout=0.1)
            except queue.Full:
                pass

    def _receive(self, deadline):
        while True:
            if self._tool_failure is not None:
                raise self._tool_failure
            if self._reader_error is not None:
                raise CodeInterpreterError(
                    f"E2B worker/transport failed; session is terminal: {self._reader_error}"
                ) from self._reader_error
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise CodeInterpreterError("E2B execution deadline exceeded; terminating owned sandbox")
            try:
                message = self._responses.get(timeout=min(remaining, 0.1))
            except queue.Empty:
                continue
            if message is None:
                if self._reader_error is not None:
                    raise CodeInterpreterError(
                        f"E2B worker/transport failed; session is terminal: {self._reader_error}"
                    ) from self._reader_error
                raise CodeInterpreterError("E2B worker disconnected; session state is lost")
            return message

    def _send(self, message, deadline):
        payload = json.dumps(message, allow_nan=False, separators=(",", ":")) + "\n"
        if len(payload.encode()) > MAX_FRAME_BYTES:
            raise CodeInterpreterError("E2B control frame exceeds 8 MiB")
        with self._send_lock:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise CodeInterpreterError("E2B execution deadline exceeded")
            self._handle.send_stdin(payload, request_timeout=min(remaining, 20))

    @with_callbacks
    def invoke_tool(self, tool_name, args, kwargs):
        value = self.tools[tool_name](*args, **kwargs)
        if inspect.isawaitable(value):

            async def await_value():
                return await value

            value = asyncio.run(await_value())
        json.dumps(value, allow_nan=False)
        return value

    def _tool(self, request, deadline, epoch, finished):
        try:
            try:
                value = self.invoke_tool(request["name"], request["args"], request["kwargs"])
                response = {"type": "tool_result", "id": request["id"], "value": value}
            except Exception as exc:
                response = {
                    "type": "tool_error",
                    "id": request["id"],
                    "error": f"{type(exc).__name__}: {exc}",
                }
            if epoch == self._epoch and not self._ended:
                self._send(response, deadline)
        except BaseException as exc:
            if epoch == self._epoch and not self._ended:
                self._tool_failure = exc
        finally:
            self._tool_slots.release()
            finished.set()

    @with_callbacks
    def execute(self, code, variables=None):
        if not self._execution_lock.acquire(blocking=False):
            raise CodeInterpreterError("E2B interpreter already has an active execution")
        try:
            self._active()
            variables = {} if variables is None else variables
            self._validate(variables)
            if not isinstance(code, str):
                raise CodeInterpreterError("code must be a string")
            encoded = json.dumps(variables, allow_nan=False, separators=(",", ":")).encode()
            if len(encoded) > MAX_INPUT_BYTES:
                raise CodeInterpreterError("E2B inputs exceed the 64 MiB per-session file limit")
            self.start()
            deadline = time.monotonic() + self.execution_timeout
            self._sandbox.set_timeout(self.sandbox_timeout, request_timeout=min(20, self.execution_timeout))
            message = {
                "type": "execute",
                "code": code,
                "tools": list(self.tools),
                "output_fields": self.output_fields,
            }
            if len(encoded) > INLINE_INPUT_BYTES:
                digest = hashlib.sha256(encoded).hexdigest()
                if digest != self._cached_digest:
                    self._sandbox.files.write(
                        INPUT_PATH, encoded, request_timeout=min(20, self.execution_timeout)
                    )
                    self._cached_digest = digest
                message["input_file"] = {"path": INPUT_PATH, "sha256": digest}
            else:
                message["variables"] = variables
            self._epoch += 1
            epoch = self._epoch
            self._send(message, deadline)
            seen_ids = set()
            finished_calls = []
            response = self._receive(deadline)
            while response["type"] == "tool_request":
                if (
                    type(response.get("id")) is not int
                    or response["id"] in seen_ids
                    or response.get("name") not in self.tools
                    or not isinstance(response.get("args"), list)
                    or not isinstance(response.get("kwargs"), dict)
                    or any(not isinstance(key, str) for key in response["kwargs"])
                ):
                    raise CodeInterpreterError("Invalid, duplicate or unregistered E2B host-tool request")
                seen_ids.add(response["id"])
                if not self._tool_slots.acquire(blocking=False):
                    self._send(
                        {
                            "type": "tool_error",
                            "id": response["id"],
                            "error": "Eight host tools are already active",
                        },
                        deadline,
                    )
                else:
                    done = threading.Event()
                    finished_calls.append(done)
                    threading.Thread(
                        target=contextvars.copy_context().run,
                        args=(self._tool, response, deadline, epoch, done),
                        daemon=True,
                    ).start()
                response = self._receive(deadline)
            for done in finished_calls:
                if not done.wait(max(0, deadline - time.monotonic())):
                    raise CodeInterpreterError("E2B host tool exceeded execution deadline")
            if self._tool_failure is not None:
                raise self._tool_failure
            kind = response["type"]
            if kind == "syntax" and isinstance(response.get("error"), str):
                raise SyntaxError(response["error"])
            if kind == "execution_error" and isinstance(response.get("error"), str):
                raise CodeExecutionError(response["error"])
            if kind == "final" and "value" in response:
                self._last_output = FinalOutput(response["value"])
                return self._last_output
            if kind == "result" and "value" in response and isinstance(response.get("stdout"), str):
                return response["value"] if response["value"] is not None else (response["stdout"] or None)
            if kind == "terminal_error" and isinstance(response.get("error"), str):
                raise CodeInterpreterError("E2B worker terminated: " + response["error"][:512])
            raise CodeInterpreterError("Invalid or terminal E2B worker response")
        except (CodeExecutionError, SyntaxError):
            raise
        except BaseException as exc:
            self._failure = exc
            self.shutdown()
            if isinstance(exc, (CodeInterpreterError, KeyboardInterrupt, asyncio.CancelledError)):
                raise
            raise CodeInterpreterError("E2B execution/setup failed; session is terminal") from exc
        finally:
            self._execution_lock.release()

    @with_callbacks
    def shutdown(self):
        original = sys.exc_info()[1] or self._failure
        self._ended = True
        self._epoch += 1
        self._stop.set()
        try:
            if (
                self._sandbox is not None
                and self._handle is not None
                and self._reader is not None
                and self._reader.is_alive()
                and not self._execution_lock.locked()
                and self._failure is None
            ):
                try:
                    self._send({"type": "shutdown"}, time.monotonic() + 2)
                    if self._reader is not None and self._reader is not threading.current_thread():
                        self._reader.join(timeout=2)
                except Exception:
                    pass  # Sandbox deletion remains required if the stream cannot close cleanly.
            if self._sandbox is not None:
                try:
                    self._sandbox.kill(request_timeout=20)
                except Exception as exc:
                    error = CodeInterpreterError(
                        f"Cleanup failed for E2B sandbox {self.sandbox_id}; "
                        f"reconcile dspy_session={self.session_id}"
                    )
                    error.sandbox_id = self.sandbox_id
                    error.session_id = self.session_id
                    error.last_output = self._last_output
                    error.original_error = original
                    error.cleanup_error = exc
                    logger.error("%s", error)
                    raise error from (original or exc)
                self._sandbox = None
        finally:
            if self._handle is not None:
                try:
                    self._handle.disconnect()
                except Exception:
                    pass  # Resource deletion above determines remote cleanup success.
            if self._reader is not None and self._reader is not threading.current_thread():
                self._reader.join(timeout=2)
