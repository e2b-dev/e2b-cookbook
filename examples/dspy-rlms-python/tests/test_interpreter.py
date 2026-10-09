import concurrent.futures
import threading
import time

import dspy
import pytest
from dspy.utils.callback import BaseCallback

from dspy_e2b import E2BInterpreter


class Actions:
    def __init__(self, codes):
        self.codes = iter(codes)

    def __call__(self, **kwargs):
        return dspy.Prediction(reasoning="deterministic contract check", code=next(self.codes))


def test_native_contract_and_recovery(transport):
    interpreter = E2BInterpreter()
    assert isinstance(interpreter, dspy.CodeInterpreter)
    assert not transport
    try:
        interpreter.start()
        interpreter.start()
        assert len(transport) == 1
        assert transport[0].config["allow_internet_access"] is False
        assert interpreter.execute("import sqlite3\nremembered=40\nopen('marker','w').write('yes')") == 3
        assert interpreter.execute("remembered+added", {"added": 2}) == 42
        assert interpreter.execute("print(open('marker').read())") == "yes"
        for code, error in [("if", SyntaxError), ("1/0", dspy.CodeExecutionError)]:
            with pytest.raises(error):
                interpreter.execute(code)
        assert interpreter.execute("6*7") == 42
        interpreter.output_fields = [{"name": "answer", "type": "int"}]
        assert interpreter.execute("SUBMIT(answer=42)\nraise Exception('unreachable')") == dspy.FinalOutput(
            {"answer": 42}
        )
        assert transport[0].timeouts == [600] * 7
    finally:
        interpreter.shutdown()
        interpreter.shutdown()
    with pytest.raises(dspy.CodeInterpreterError, match="ended"):
        interpreter.execute("42")
    assert len(transport) == 1


def test_tools_callbacks_concurrent_and_async(transport):
    events = []

    class Callback(BaseCallback):
        def on_interpreter_tool_call_end(self, call_id, outputs, exception=None):
            events.append((outputs, exception))

    async def add(left, right):
        return left + right

    interpreter = E2BInterpreter(callbacks=[Callback()])
    interpreter.tools["add"] = add
    try:
        code = """from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(2) as pool:
    values=list(pool.map(lambda n: add(left=n,right=1), [20,21]))
sum(values)"""
        assert interpreter.execute(code) == 43
        assert sorted(value for value, error in events if error is None) == [21, 22]
        interpreter.tools["bad"] = lambda: {"not-json"}
        with pytest.raises(dspy.CodeExecutionError, match="TypeError"):
            interpreter.execute("bad()")
        assert interpreter.execute("42") == 42
    finally:
        interpreter.shutdown()


def test_large_inputs_cache_and_fresh_assignment(transport):
    interpreter = E2BInterpreter()
    original = {"payload": {"text": "x" * 90_000, "count": 1}}
    try:
        assert interpreter.execute("payload['count']=9\nlen(payload['text'])", original) == 90_000
        assert interpreter.execute("payload['count']", original) == 1
        inputs = transport[0].writes[-1]
        assert inputs.endswith("inputs.json")
        assert transport[0].writes.count(inputs) == 1
        changed = {"payload": {"text": "x" * 90_000, "count": 2}}
        assert interpreter.execute("payload['count']", changed) == 2
        assert transport[0].writes.count(inputs) == 2
        assert interpreter.execute("payload['count']", {"payload": {"count": 3}}) == 3
        interpreter.execute("open(" + repr(inputs) + ",'w').write('{}')")
        assert interpreter.execute("payload['count']", changed) == 2
        assert transport[0].writes.count(inputs) == 2
        assert interpreter.execute("payload['count']", original) == 1
        assert transport[0].writes.count(inputs) == 3
    finally:
        interpreter.shutdown()


def test_native_rlm_loop(transport):
    owned = []

    def factory():
        value = E2BInterpreter()
        owned.append(value)
        return value

    factory.execution_instructions = E2BInterpreter.execution_instructions
    rlm = dspy.RLM("query: str -> answer: int", interpreter_factory=factory, max_iters=4)
    rlm.generate_action = Actions(
        ["if", "1/0", "values=llm_query_batched(['a','b'])\nprint(values)", "SUBMIT(answer=len(values))"]
    )
    rlm.sub_lm = lambda prompt: ["stub " + prompt]
    result = rlm(query="q")
    assert result.answer == 2
    assert "invalid syntax" in result.trajectory[0]["output"]
    assert "ZeroDivisionError" in result.trajectory[1]["output"]
    assert owned[-1]._ended
    rlm.generate_action = Actions(["values", "SUBMIT(answer=7)"])
    result = rlm(query="q")
    assert result.answer == 7
    assert "NameError" in result.trajectory[0]["output"]
    assert len(transport) == 2


@pytest.mark.parametrize(
    "code",
    [
        "while True: pass",
        "import os\nos._exit(9)",
        "import threading,time\nthreading.Thread(target=lambda: time.sleep(10)).start()",
    ],
)
def test_terminal_remote_work(transport, code):
    interpreter = E2BInterpreter(execution_timeout=0.3)
    started = time.monotonic()
    with pytest.raises(dspy.CodeInterpreterError) as error:
        interpreter.execute(code)
    assert not isinstance(error.value, dspy.CodeExecutionError)
    assert interpreter._ended and transport[0].kills >= 1
    assert time.monotonic() - started < 3
    with pytest.raises(dspy.CodeInterpreterError):
        interpreter.execute("42")


def test_host_deadline_and_overlap(transport):
    entered, release = threading.Event(), threading.Event()

    def blocked():
        entered.set()
        release.wait(3)
        return 42

    interpreter = E2BInterpreter(tools={"blocked": blocked}, execution_timeout=0.3)
    with concurrent.futures.ThreadPoolExecutor(1) as pool:
        result = pool.submit(interpreter.execute, "blocked()")
        assert entered.wait(2)
        with pytest.raises(dspy.CodeInterpreterError, match="active execution"):
            interpreter.execute("42")
        with pytest.raises(dspy.CodeInterpreterError, match="deadline"):
            result.result(timeout=2)
        assert interpreter._ended and not release.is_set()
        release.set()


def test_cleanup_error_retains_answer_and_retry(transport):
    interpreter = E2BInterpreter()
    output = interpreter.execute("SUBMIT(42)")
    transport[0].fail_kill = True
    with pytest.raises(dspy.CodeInterpreterError) as caught:
        interpreter.shutdown()
    assert caught.value.sandbox_id == interpreter.sandbox_id
    assert caught.value.last_output == output
    assert isinstance(caught.value.cleanup_error, OSError)
    transport[0].fail_kill = False
    interpreter.shutdown()
    assert interpreter._sandbox is None


def test_cleanup_error_retains_original(transport):
    interpreter = E2BInterpreter(execution_timeout=0.2)
    interpreter.start()
    transport[0].fail_kill = True
    with pytest.raises(dspy.CodeInterpreterError) as caught:
        interpreter.execute("while True: pass")
    assert "deadline" in str(caught.value.original_error)
    assert caught.value.__cause__ is caught.value.original_error
    transport[0].fail_kill = False
    interpreter.shutdown()


def test_initialization_failure_and_empty_shutdown(transport, monkeypatch):
    empty = E2BInterpreter()
    empty.shutdown()
    assert not transport
    original = __import__("dspy_e2b.interpreter", fromlist=["Sandbox"]).Sandbox.create

    def failed(**kwargs):
        sandbox = original(**kwargs)
        sandbox.fail_write = True
        return sandbox

    monkeypatch.setattr("dspy_e2b.interpreter.Sandbox.create", failed)
    interpreter = E2BInterpreter()
    with pytest.raises(dspy.CodeInterpreterError, match="initialize"):
        interpreter.start()
    assert interpreter._ended and transport[0].kills == 1


@pytest.mark.parametrize("variables", [{"SUBMIT": 1}, {"bad-name": 1}, {"x": float("nan")}, {"x": object()}])
def test_input_trust_boundary(transport, variables):
    interpreter = E2BInterpreter()
    with pytest.raises(dspy.CodeInterpreterError):
        interpreter.execute("42", variables)
    assert not transport


@pytest.mark.parametrize(
    "message",
    [
        {"type": "tool_request", "id": 1, "name": "unregistered", "args": [], "kwargs": {}},
        {"type": "tool_request", "id": True, "name": "add", "args": [], "kwargs": {}},
        {"type": "result", "value": 42},
    ],
)
def test_protocol_shape(transport, monkeypatch, message):
    interpreter = E2BInterpreter(tools={"add": lambda: 42})
    interpreter.start()
    monkeypatch.setattr(interpreter, "_send", lambda *args: None)
    monkeypatch.setattr(interpreter, "_receive", lambda *args: message)
    with pytest.raises(dspy.CodeInterpreterError):
        interpreter.execute("42")
    assert interpreter._ended


def test_duplicate_tool_id(transport, monkeypatch):
    interpreter = E2BInterpreter(tools={"add": lambda: 42})
    interpreter.start()
    message = {"type": "tool_request", "id": 1, "name": "add", "args": [], "kwargs": {}}
    monkeypatch.setattr(interpreter, "_send", lambda *args: None)
    monkeypatch.setattr(interpreter, "_receive", lambda *args: dict(message))
    with pytest.raises(dspy.CodeInterpreterError, match="duplicate"):
        interpreter.execute("42")


@pytest.mark.parametrize("chunk", ["not-json\n", "[]\n", "x" * 100])
def test_reader_guards(transport, monkeypatch, chunk):
    interpreter = E2BInterpreter()
    interpreter._handle = [(chunk, "", None)]
    monkeypatch.setattr("dspy_e2b.interpreter.MAX_FRAME_BYTES", 64)
    interpreter._read()
    assert interpreter._reader_error is not None
    interpreter.shutdown()


def test_frame_and_output_limits(transport, monkeypatch):
    interpreter = E2BInterpreter()
    interpreter.start()
    monkeypatch.setattr("dspy_e2b.interpreter.MAX_FRAME_BYTES", 128)
    with pytest.raises(dspy.CodeInterpreterError, match="frame"):
        interpreter.execute("#" * 256)
    assert interpreter._ended
    monkeypatch.undo()


@pytest.mark.parametrize("character", ["x", '"', "😀"])
def test_worker_output_truncation(transport, character):
    interpreter = E2BInterpreter()
    try:
        output = interpreter.execute(f"print({character!r} * (8 * 1024 * 1024 + 1))")
        assert output.startswith(character * 10) and output.endswith("\n[output truncated]")
        assert len(output.encode()) <= 1024 * 1024 + 32
        assert interpreter.execute("42") == 42
    finally:
        interpreter.shutdown()


def test_repeated_large_stdout_preserves_session(transport):
    interpreter = E2BInterpreter()
    try:
        for _ in range(8):
            output = interpreter.execute("print('x' * (8 * 1024 * 1024 + 1))")
            assert output.endswith("\n[output truncated]")
        assert interpreter.execute("42") == 42
    finally:
        interpreter.shutdown()


def test_response_budget_error_survives_receive_race(transport, monkeypatch):
    import dspy_e2b.interpreter as driver

    interpreter = E2BInterpreter()
    interpreter.start()
    reader_error = None

    def over_budget():
        nonlocal reader_error
        guarded = E2BInterpreter()
        guarded._handle = [("x" * 65, "", None)]
        monkeypatch.setattr(driver, "MAX_INPUT_BYTES", 64)
        guarded._read()
        reader_error = guarded._reader_error
        interpreter._reader_error = reader_error
        return None

    monkeypatch.setattr(interpreter._responses, "get", lambda **kwargs: over_budget())
    with pytest.raises(dspy.CodeInterpreterError, match="64 MiB response budget") as caught:
        interpreter.execute("42")
    assert caught.value.__cause__ is reader_error
    assert interpreter._ended and transport[0].kills == 1


def test_worker_network_settings_and_orderly_shutdown(transport):
    interpreter = E2BInterpreter()
    assert interpreter.execute("import os\nos.environ['PIP_NO_INDEX']") == "1"
    assert interpreter.execute("os.environ['RES_OPTIONS']") == "timeout:1 attempts:1"
    interpreter.shutdown()
    assert transport[0].exited_before_kill
    assert not interpreter._reader.is_alive()


def test_new_input_content_still_requires_digest_verification(transport, monkeypatch):
    interpreter = E2BInterpreter()
    interpreter.start()
    write = transport[0].files.write
    monkeypatch.setattr(transport[0].files, "write", lambda path, data, **kw: write(path, b"{}", **kw))
    with pytest.raises(dspy.CodeInterpreterError, match="digest"):
        interpreter.execute("payload", {"payload": "x" * 90_000})
    assert interpreter._ended and transport[0].kills == 1


def test_large_return_value_remains_a_terminal_frame_error(transport):
    interpreter = E2BInterpreter()
    with pytest.raises(dspy.CodeInterpreterError, match="frame"):
        interpreter.execute("'x' * (8 * 1024 * 1024 + 1)")
    assert interpreter._ended


def test_input_file_size_limit(transport, monkeypatch):
    monkeypatch.setattr("dspy_e2b.interpreter.MAX_INPUT_BYTES", 64)
    interpreter = E2BInterpreter()
    with pytest.raises(dspy.CodeInterpreterError, match="inputs exceed"):
        interpreter.execute("payload", {"payload": "x" * 100})
    assert not transport


@pytest.mark.parametrize("timeout", [0, -1, True, float("inf")])
def test_budget_validation(timeout):
    with pytest.raises(ValueError):
        E2BInterpreter(execution_timeout=timeout)
    with pytest.raises(ValueError):
        E2BInterpreter(sandbox_timeout=timeout)


def test_host_tool_cap_and_context(transport, monkeypatch):
    import contextvars

    request = contextvars.ContextVar("request")
    request.set(42)
    interpreter = E2BInterpreter(tools={"request": request.get})
    try:
        assert interpreter.execute("request()") == 42
        monkeypatch.setattr(interpreter._tool_slots, "acquire", lambda **kwargs: False)
        with pytest.raises(dspy.CodeExecutionError, match="Eight host tools"):
            interpreter.execute("request()")
        assert interpreter.execute("42") == 42
    finally:
        interpreter.shutdown()
