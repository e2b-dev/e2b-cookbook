"""Non-billable transport double; executes the real packaged worker locally."""

import os
import subprocess
import sys
from types import SimpleNamespace

import pytest

import dspy_e2b.interpreter as driver


class LocalHandle:
    def __init__(self, path, cwd, envs):
        self.process = subprocess.Popen(
            [sys.executable, "-u", str(path)],
            cwd=cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env={**os.environ, **envs},
        )

    def __iter__(self):
        for line in self.process.stdout:
            yield line, "", None
        self.process.wait(timeout=2)

    def send_stdin(self, payload, **_):
        self.process.stdin.write(payload)
        self.process.stdin.flush()

    def disconnect(self):
        pass


@pytest.fixture
def transport(monkeypatch, tmp_path):
    worker = str(tmp_path / "worker.py")
    inputs = str(tmp_path / "inputs.json")
    monkeypatch.setattr(driver, "WORKER_PATH", worker)
    monkeypatch.setattr(driver, "INPUT_PATH", inputs)
    owned = []

    class FakeSandbox:
        def __init__(self, config):
            self.config = config
            self.sandbox_id = f"local-{len(owned)}"
            self.writes = []
            self.timeouts = []
            self.kills = 0
            self.fail_kill = False
            self.fail_write = False
            self.handle = None
            self.exited_before_kill = False
            self.files = SimpleNamespace(write=self.write)
            self.commands = SimpleNamespace(run=self.run)

        def write(self, path, data, **_):
            if self.fail_write:
                raise OSError("upload failed")
            self.writes.append(path)
            if path == worker:
                data = data.replace('INPUT_PATH = "/home/user/.dspy-inputs.json"', f"INPUT_PATH = {inputs!r}")
            with open(path, "wb") as file:
                file.write(data.encode() if isinstance(data, str) else data)

        def run(self, command, **kwargs):
            assert kwargs["stdin"] and kwargs["background"] and kwargs["timeout"] == 0
            self.handle = LocalHandle(worker, tmp_path, kwargs["envs"])
            return self.handle

        def set_timeout(self, timeout, **_):
            self.timeouts.append(timeout)

        def kill(self, **_):
            self.kills += 1
            if self.fail_kill:
                raise OSError("delete failed")
            if self.handle is not None:
                self.exited_before_kill = self.handle.process.poll() == 0
                self.handle.process.kill()
                self.handle.process.wait(timeout=2)
            return True

    def create(**kwargs):
        value = FakeSandbox(kwargs)
        owned.append(value)
        return value

    monkeypatch.setattr(driver.Sandbox, "create", create)
    yield owned
    for sandbox in owned:
        sandbox.fail_kill = False
        sandbox.kill()
        if sandbox.handle is not None:
            for stream in (
                sandbox.handle.process.stdin,
                sandbox.handle.process.stdout,
                sandbox.handle.process.stderr,
            ):
                stream.close()
