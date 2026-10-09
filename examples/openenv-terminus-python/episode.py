"""Cookbook-local task environment; TRL discovers only terminal and submit."""

from __future__ import annotations

import json
import shlex
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from e2b import (
    CommandExitException,
    FileNotFoundException,
    Sandbox,
    SandboxNotFoundException,
)
from openenv.core.env_server.mcp_types import CallToolAction
from terminus_env import TerminusEnv

BASE_URL = "http://127.0.0.1:8010"
TASK = json.loads(Path(__file__).with_name("task.json").read_text())
BUGGY = """import csv, json
from pathlib import Path
totals = {}
for row in csv.DictReader(Path("/home/user/work/sales.csv").open()):
    totals[row["region"]] = int(row["amount"])
print(json.dumps(totals, sort_keys=True))
"""
PROGRAM = "/home/user/work/report.py"
RUN_REPORT = f"python3 -B {PROGRAM}"
EPISODE_SECONDS = 120
SANDBOX_SECONDS = 600
COMMAND_SECONDS = 10
VERIFIER_SECONDS = 120
MAX_FILE_BYTES = 64 * 1024
REPORT_OUTPUT = "/home/user/work/output.json"
_PACING_LOCK = threading.Lock()
_LAST_RESET = 0.0


class InfrastructureError(RuntimeError):
    """Stop a rollout instead of training on unavailable infrastructure."""


def _pace_creation():
    global _LAST_RESET
    with _PACING_LOCK:
        time.sleep(max(0, 1.1 - (time.monotonic() - _LAST_RESET)))
        _LAST_RESET = time.monotonic()


def _write(path: str, content: str) -> str:
    return f"printf %s {shlex.quote(content)} > {shlex.quote(path)}"


def score_report(output: str | bytes | None, expected: dict) -> float:
    try:
        actual = json.loads(output)
    except (ValueError, TypeError, UnicodeDecodeError):
        return 0.0
    if not isinstance(actual, dict) or any(type(v) is not int for v in actual.values()):
        return 0.0
    return float(actual == expected)


def _text(observation) -> str:
    if observation.error:
        raise InfrastructureError("OpenEnv tool/transport failure")
    result = observation.result
    if isinstance(result, dict):
        if result.get("is_error"):
            raise InfrastructureError("OpenEnv tool failure")
        content = result.get("structured_content")
        if not isinstance(content, dict) or not isinstance(content.get("result"), str):
            raise InfrastructureError("Malformed OpenEnv tool response")
        return content["result"]
    if getattr(result, "is_error", False):
        raise InfrastructureError("OpenEnv tool failure")
    if isinstance(result, str):
        return result
    return "\n".join(part.text for part in result.content if hasattr(part, "text"))


class ReportEpisode:
    def __init__(self):
        self._client = None
        self._policy = None
        self._owned = set()
        self._active_id = None
        self._fatal = None
        self._finished = False
        self._reward = None
        self._deadline = 0.0
        self._task = TASK
        self._trace = []
        self._cleanup = []
        self._resources = {}

    def reset(self, task: dict | None = None, **kwargs) -> str:
        self._close()
        self._fatal = None
        self._finished = False
        self._reward = None
        self._task = TASK if task is None else task
        self._deadline = time.monotonic() + EPISODE_SECONDS
        started = time.monotonic()
        try:
            _pace_creation()
            self._client = TerminusEnv(base_url=BASE_URL, message_timeout_s=25).sync()
            result = self._client.reset(
                setup=[
                    "mkdir -p /home/user/work",
                    _write(PROGRAM, BUGGY),
                    _write("/home/user/work/sales.csv", self._task["input"]),
                ],
                # Native completion signal only; cookbook score is host-held.
                verify=["true"],
            )
            metadata = result.observation.metadata
            self._active_id = metadata.get("sandbox_id")
            if self._active_id:
                self._owned.add(self._active_id)
            if metadata.get("status") != "ready" or not self._active_id:
                raise InfrastructureError(
                    "Reset failed; allocation may be unknown if no ID was returned"
                )
            Sandbox.set_timeout(self._active_id, SANDBOX_SECONDS, request_timeout=10)
            info = Sandbox.get_info(self._active_id, request_timeout=10)
            self._resources[self._active_id] = {
                "started_at": info.started_at.isoformat(),
                "cpu_count": info.cpu_count,
                "memory_mb": info.memory_mb,
                "template_id": info.template_id,
                "role": "policy",
            }
            self._check()
            # Attach before policy execution; submission never reconnects or resumes it.
            self._policy = Sandbox.connect(self._active_id, request_timeout=10)
            self._trace.append(
                {
                    "operation": "reset",
                    "sandbox_id": self._active_id,
                    "seconds": round(time.monotonic() - started, 3),
                }
            )
            return "\nFresh episode ready: files persist across terminal calls."
        except Exception as exc:
            self._fatal = (
                f"reset failed: {exc}"
                if isinstance(exc, InfrastructureError)
                else f"reset failed ({type(exc).__name__})"
            )
            try:
                self._close()
            finally:
                raise InfrastructureError(self._fatal) from exc

    def _check_deadline(self):
        if self._fatal:
            raise InfrastructureError(self._fatal)
        if time.monotonic() >= self._deadline:
            raise InfrastructureError("Episode deadline exceeded")

    def _check(self):
        self._check_deadline()
        if not self._active_id:
            raise InfrastructureError("Episode absent")
        # Never resume, recreate, or replay an expired episode.
        info = Sandbox.get_info(self._active_id, request_timeout=10)
        if str(info.state).lower().split(".")[-1] != "running":
            raise InfrastructureError("Episode sandbox is not running")

    def _step(self, **arguments) -> str:
        started = time.monotonic()
        try:
            self._check()
            result = self._client.step(
                CallToolAction(tool_name="terminal", arguments=arguments)
            )
            output = _text(result.observation)
            self._trace.append(
                {
                    "operation": "submit" if "final_answer" in arguments else "step",
                    "sandbox_id": self._active_id,
                    "seconds": round(time.monotonic() - started, 3),
                }
            )
            # Completed command output is policy data, never an infrastructure signal.
            self._check()
            return output
        except Exception as exc:
            self._fatal = (
                f"step failed: {exc}"
                if isinstance(exc, InfrastructureError)
                else f"step failed ({type(exc).__name__})"
            )
            raise InfrastructureError(self._fatal) from exc

    def terminal(self, command: str) -> str:
        """Execute a shell command in this episode. Files persist across calls.

        Args:
            command: Shell command to inspect, run or edit the report program.
        """
        if self._finished:
            return "Episode finished; no further commands allowed."
        bounded = (
            f"timeout --signal=KILL {COMMAND_SECONDS}s sh -c {shlex.quote(command)}"
        )
        return self._step(command=bounded)

    def submit(self) -> str:
        """Check the submitted report in a fresh sandbox on held-out CSV data."""
        if self._finished:
            return "Episode already submitted."
        self._finished = True
        started = time.monotonic()
        policy_id = self._active_id
        verifier_id = None
        try:
            self._check()
            artifact = self._read_file(self._policy, PROGRAM)
            self._check()
            template = self._resources[policy_id]["template_id"]
            self._close()  # Confirm the policy workspace is gone before verification.
            reward = 0.0
            if artifact is not None:
                _pace_creation()
                self._check_deadline()
                verifier = Sandbox.create(
                    template=template,
                    timeout=VERIFIER_SECONDS,
                    allow_internet_access=False,
                    request_timeout=10,
                )
                verifier_id = self._active_id = verifier.sandbox_id
                self._owned.add(verifier_id)
                info = Sandbox.get_info(verifier_id, request_timeout=10)
                self._resources[verifier_id] = {
                    "started_at": info.started_at.isoformat(),
                    "cpu_count": info.cpu_count,
                    "memory_mb": info.memory_mb,
                    "template_id": info.template_id,
                    "role": "verifier",
                }
                self._check()
                verifier.files.write(PROGRAM, artifact, request_timeout=10)
                verifier.files.write(
                    "/home/user/work/sales.csv",
                    self._task["verification"]["input"],
                    request_timeout=10,
                )
                self._check()
                try:
                    result = verifier.commands.run(
                        f"timeout --signal=KILL {COMMAND_SECONDS}s {RUN_REPORT} "
                        f"> {REPORT_OUTPUT} 2> /home/user/work/error.log",
                        timeout=20,
                    )
                    exit_code = result.exit_code
                except CommandExitException as exc:
                    exit_code = exc.exit_code
                self._check()
                if exit_code == 0:
                    output = self._read_file(verifier, REPORT_OUTPUT)
                    self._check()
                    reward = score_report(
                        output, self._task["verification"]["expected"]
                    )
            self._close()
            self._check_deadline()
            self._reward = (
                reward  # Commit only after both resources are confirmed absent.
            )
            self._trace.append(
                {
                    "operation": "submit",
                    "policy_sandbox_id": policy_id,
                    "sandbox_id": verifier_id,
                    "seconds": round(time.monotonic() - started, 3),
                }
            )
            return f"Report reward: {self._reward}"
        except Exception as exc:
            self._fatal = (
                f"submission failed: {exc}"
                if isinstance(exc, InfrastructureError)
                else f"submission failed ({type(exc).__name__})"
            )
            raise InfrastructureError(self._fatal) from exc
        finally:
            self._close()

    def _read_file(self, sandbox, path: str) -> bytes | None:
        data = bytearray()
        try:
            with sandbox.files.read(
                path, format="stream", request_timeout=10
            ) as stream:
                for chunk in stream:
                    self._check_deadline()
                    if len(data) + len(chunk) > MAX_FILE_BYTES:
                        return None
                    data.extend(chunk)
        except FileNotFoundException:
            return None
        return bytes(data)

    def get_reward(self) -> float:
        try:
            if self._fatal:
                raise InfrastructureError(self._fatal)
            if self._reward is not None:
                return self._reward
            self._check()
            # A healthy episode without submission gets zero, never a hidden infra score.
            return 0.0
        except Exception as exc:
            self._fatal = self._fatal or (
                f"reward failed: {exc}"
                if isinstance(exc, InfrastructureError)
                else f"reward failed ({type(exc).__name__})"
            )
            raise InfrastructureError(self._fatal) from exc
        finally:
            self._finished = True
            self._close()

    def _close(self):
        errors = []
        if self._client is not None:
            try:
                self._client.close()
            except Exception as exc:
                errors.append(f"client close: {type(exc).__name__}")
            finally:
                self._client = None
        for sandbox_id in list(self._owned):
            last_error = None
            for attempt in range(3):
                try:
                    Sandbox.kill(sandbox_id, request_timeout=10)
                    Sandbox.get_info(sandbox_id, request_timeout=10)
                    last_error = "still present"
                except SandboxNotFoundException:
                    self._owned.remove(sandbox_id)
                    self._cleanup.append(
                        {
                            "sandbox_id": sandbox_id,
                            "status": "confirmed absent",
                            "confirmed_at": datetime.now(timezone.utc).isoformat(),
                        }
                    )
                    break
                except Exception as exc:
                    last_error = type(exc).__name__
                time.sleep(0.2 * (attempt + 1))
            if sandbox_id in self._owned:
                errors.append(f"{sandbox_id}: {last_error}")
        if not self._owned:
            self._active_id = None
            self._policy = None
        if errors:
            self._fatal = "Cleanup unresolved: " + "; ".join(errors)
            raise InfrastructureError(self._fatal)
