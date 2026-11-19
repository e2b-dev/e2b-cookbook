import json
import queue
import threading
import time
from pathlib import Path

import dspy
import pytest

import main
from dspy_e2b import E2BInterpreter


@pytest.mark.parametrize("drain", [True, False])
def test_reader_backpressure_and_shutdown(drain):
    blocked = threading.Event()

    class ObservedQueue(queue.Queue):
        def put(self, item, **kwargs):
            if self.full():
                blocked.set()
            return super().put(item, **kwargs)

    interpreter = E2BInterpreter()
    interpreter._responses = ObservedQueue(maxsize=32)
    frames = "".join(json.dumps({"type": "result", "value": i, "stdout": ""}) + "\n" for i in range(64))

    def chunks():
        yield frames, "", None
        interpreter._stop.wait(3)

    interpreter._handle = chunks()
    interpreter._reader = threading.Thread(target=interpreter._read)
    interpreter._reader.start()
    try:
        assert blocked.wait(2)
        interpreter._reader.join(timeout=0.2)
        assert interpreter._reader_error is None
        assert interpreter._responses.qsize() == 32
        if drain:
            deadline = time.monotonic() + 2
            assert [interpreter._receive(deadline)["value"] for _ in range(64)] == list(range(64))
    finally:
        interpreter.shutdown()
    assert not interpreter._reader.is_alive()
    assert interpreter._reader_error is None


def test_host_tool_burst_returns_per_call_errors_and_preserves_state(transport, monkeypatch):
    release = threading.Event()
    lock = threading.Lock()
    active = peak = 0

    def held(index):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        try:
            assert release.wait(3)
            return index
        finally:
            with lock:
                active -= 1

    interpreter = E2BInterpreter(tools={"held": held})
    send = interpreter._send

    def send_and_release(message, deadline):
        send(message, deadline)
        if message.get("type") == "tool_error":
            release.set()

    monkeypatch.setattr(interpreter, "_send", send_and_release)
    code = """from concurrent.futures import ThreadPoolExecutor
remembered = 41
def call(index):
    try:
        return held(index)
    except RuntimeError as error:
        return str(error)
with ThreadPoolExecutor(64) as pool:
    replies = list(pool.map(call, range(64)))
replies"""
    try:
        replies = interpreter.execute(code)
        assert len(replies) == 64 and peak == 8 and active == 0
        assert any("Eight host tools" in reply for reply in replies if isinstance(reply, str))
        assert all(
            reply == index or (isinstance(reply, str) and "Eight host tools" in reply)
            for index, reply in enumerate(replies)
        )
        assert interpreter.execute("remembered + 1") == 42
    finally:
        release.set()
        interpreter.shutdown()
    assert not interpreter._reader.is_alive()


@pytest.mark.parametrize("deadline", [False, True])
def test_slow_host_burst_backpressure_and_deadline(transport, monkeypatch, deadline):
    hold = threading.Event()
    interpreter = E2BInterpreter(
        tools={"echo": lambda index: hold.wait(5) and index},
        execution_timeout=2 if deadline else 60,
    )
    send = interpreter._send

    def slow_send(message, expires):
        if message.get("type") == "tool_error":
            time.sleep(1 if deadline else 0.15)
        send(message, expires)

    monkeypatch.setattr(interpreter, "_send", slow_send)
    code = """from concurrent.futures import ThreadPoolExecutor
remembered = 41
def call(index):
    try:
        return echo(index)
    except RuntimeError:
        return 'ERR'
with ThreadPoolExecutor(64) as pool:
    replies = list(pool.map(call, range(64)))
[sum(reply == 'ERR' for reply in replies), len(replies)]"""
    release = threading.Timer(3, hold.set)
    release.start()
    started = time.monotonic()
    try:
        if deadline:
            with pytest.raises(dspy.CodeInterpreterError, match="deadline"):
                interpreter.execute(code)
            assert time.monotonic() - started < 4
            assert interpreter._ended and transport[0].kills == 1
        else:
            errors, total = interpreter.execute(code)
            assert total == 64 and errors > 0
            assert interpreter.execute("remembered + 1") == 42
    finally:
        hold.set()
        release.cancel()
        release.join()
        interpreter.shutdown()
    assert not interpreter._reader.is_alive()


@pytest.mark.parametrize("character, size", [("x", 8 * 1024 * 1024), ('"', 4 * 1024 * 1024), ("😀", 700_000)])
def test_oversized_tool_arguments_are_recoverable(transport, character, size):
    called = []
    interpreter = E2BInterpreter(tools={"echo": lambda value: called.append(value) or value})
    try:
        interpreter.execute(
            "import sqlite3\ndb = sqlite3.connect(':memory:')\n"
            "db.execute('CREATE TABLE kept(value INTEGER)')\n"
            "db.execute('INSERT INTO kept VALUES (41)')\n"
            f"corpus = {character!r} * {size}\nlen(corpus)"
        )
        with pytest.raises(dspy.CodeExecutionError, match="ValueError: Host-tool request exceeds"):
            interpreter.execute("echo(corpus)")
        assert not called and not interpreter._ended and transport[0].kills == 0
        assert interpreter.execute("db.execute('SELECT value FROM kept').fetchone()[0] + 1") == 42
        assert interpreter.execute("echo('ok')") == "ok" and called == ["ok"]
    finally:
        interpreter.shutdown()


def test_tool_request_wire_frame_boundary_includes_newline(transport):
    request = {"type": "tool_request", "id": 0, "name": "echo", "args": [""], "kwargs": {}}
    overhead = len((json.dumps(request, separators=(",", ":")) + "\n").encode())
    size = 8 * 1024 * 1024 - overhead
    called = []
    interpreter = E2BInterpreter(tools={"echo": lambda value: called.append(len(value)) or value})
    try:
        assert interpreter.execute(f"corpus = 'x' * {size}\nlen(echo(corpus))") == size
        with pytest.raises(dspy.CodeExecutionError, match="Host-tool request exceeds"):
            interpreter.execute("corpus += 'x'\nlen(echo(corpus))")
        assert called == [size] and not interpreter._ended
        assert interpreter.execute("len(corpus)") == size + 1
    finally:
        interpreter.shutdown()


def test_oversized_expression_preserves_python_state(transport):
    interpreter = E2BInterpreter()
    try:
        with pytest.raises(dspy.CodeExecutionError, match="Expression result exceeds"):
            interpreter.execute("remembered = 41\nlarge = 'x' * (8 * 1024 * 1024 + 1)\nlarge")
        assert not interpreter._ended and transport[0].kills == 0
        assert interpreter.execute("remembered + 1") == 42
        assert interpreter.execute("len(large)") == 8 * 1024 * 1024 + 1
    finally:
        interpreter.shutdown()


def test_oversized_submission_is_not_truncated(transport):
    interpreter = E2BInterpreter(output_fields=[{"name": "answer", "type": "str"}])
    with pytest.raises(dspy.CodeInterpreterError, match="frame"):
        interpreter.execute("SUBMIT(answer='x' * (8 * 1024 * 1024 + 1))")
    assert interpreter._ended and interpreter._last_output is None


def test_input_is_recoverable_and_protocol_remains_usable(transport):
    interpreter = E2BInterpreter(execution_timeout=0.5)
    try:
        with pytest.raises(dspy.CodeExecutionError, match="EOFError"):
            interpreter.execute("input('value? ')")
        assert interpreter.execute("42") == 42
    finally:
        interpreter.shutdown()


@pytest.mark.parametrize(
    "code",
    [
        "import sys\nsys.stdin.read()",
        "import os\nos.read(0, 1).decode()",
        "import subprocess, sys\n"
        "subprocess.run([sys.executable, '-c', 'import sys; print(sys.stdin.read(), end=\"\")'], "
        "stdout=subprocess.PIPE, text=True, close_fds=False).stdout",
    ],
)
def test_generated_stdin_and_child_stdin_are_eof(transport, code):
    interpreter = E2BInterpreter(execution_timeout=0.5, tools={"answer": lambda: 42})
    try:
        assert interpreter.execute(code) == ""
        assert interpreter.execute("answer()") == 42
    finally:
        interpreter.shutdown()


@pytest.mark.parametrize("mismatch", ["IDs", "counts"])
def test_main_writes_answer_and_trajectory_on_fixture_mismatch(monkeypatch, tmp_path, capsys, mismatch):
    prediction = dspy.Prediction(
        candidate_ids=[] if mismatch == "IDs" else ["INC-001", "INC-002", "INC-004", "INC-006"],
        queue_incident_ids=["INC-001"],
        counts_by_region={"eu": 999},
        summary="Fixture mismatch",
        trajectory=[{"code": "SUBMIT(...)"}],
    )
    monkeypatch.setattr(dspy, "RLM", lambda *args, **kwargs: lambda **inputs: prediction)
    monkeypatch.setattr(main, "load_dotenv", lambda: None)
    monkeypatch.setenv("E2B_API_KEY", "not-used")
    monkeypatch.setenv("OPENAI_API_KEY", "not-used")
    monkeypatch.delenv("MODEL", raising=False)
    monkeypatch.chdir(tmp_path)
    with pytest.raises(ValueError, match=mismatch):
        main.main([])
    artifact = json.loads(Path("result.json").read_text())
    assert artifact["answer"]["counts_by_region"] == {"eu": 999}
    assert artifact["trajectory"] == prediction.trajectory
    assert artifact["fixture_assessment"]["exact_ids_and_counts"] == "failed"
    assert mismatch in artifact["fixture_assessment"]["error"]
    assert json.loads(capsys.readouterr().out) == artifact
