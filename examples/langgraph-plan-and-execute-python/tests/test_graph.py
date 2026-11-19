"""Graph wiring and lifecycle checks with a fake sandbox — no network, no billing.

The LLM calls (`make_plan`, `run_step`) are swapped for stubs; the E2B SDK is
replaced by `FakeSandbox`, which mimics the one behaviour the graph relies on:
`commands.run` raises `CommandExitException` on a non-zero exit.
"""

from __future__ import annotations

import pytest
from e2b import CommandExitException
from langgraph.types import Command

import main
from sandbox_tools import PYTEST, REPO_DIR, RunContext


class FakeCommands:
    def __init__(self, sandbox: FakeSandbox) -> None:
        self.sandbox = sandbox

    def run(self, cmd: str, **_: object):
        if cmd != PYTEST:  # pip install etc.
            return CommandExitException(stdout="", stderr="", exit_code=0, error=None)
        exit_code = self.sandbox.exit_codes[
            min(self.sandbox.runs, len(self.sandbox.exit_codes) - 1)
        ]
        self.sandbox.runs += 1
        result = CommandExitException(
            stdout=f"pytest run {self.sandbox.runs}",
            stderr="",
            exit_code=exit_code,
            error=None,
        )
        if exit_code:
            raise result
        return result


class FakeFiles:
    def __init__(self) -> None:
        self.written: dict[str, str] = {}

    def write(self, path: str, data: str) -> None:
        self.written[path] = data


class FakeSandbox:
    """`exit_codes` is the scripted pytest result per run; the last one repeats."""

    def __init__(self, exit_codes: list[int], sandbox_id: str = "sbx_fake") -> None:
        self.exit_codes = exit_codes
        self.runs = 0
        self.sandbox_id = sandbox_id
        self.commands = FakeCommands(self)
        self.files = FakeFiles()


@pytest.fixture
def graph(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        main,
        "make_plan",
        lambda model, files, output: ["fix shop/cart.py", "fix shop/discount.py"],
    )
    monkeypatch.setattr(main, "run_step", lambda context, files, step: f"did: {step}")
    return main.build_graph()


CONFIG = {"configurable": {"thread_id": "test"}}


def test_resume_rebuilds_context_from_checkpointed_sandbox_id(graph) -> None:
    sandbox = FakeSandbox(exit_codes=[1, 0])
    result = graph.invoke({}, config=CONFIG, context=RunContext(sandbox, model=None))

    assert "__interrupt__" in result
    assert result["sandbox_id"] == sandbox.sandbox_id
    assert f"{REPO_DIR}/tests/test_shop.py" in sandbox.files.written
    assert "shop/cart.py" in result["files"]

    # Context is not checkpointed: resuming without one fails inside the node.
    with pytest.raises(AttributeError):
        graph.invoke(Command(resume=True), config=CONFIG)

    # What main() does: a *new* handle for the id the checkpoint kept.
    reconnected = FakeSandbox(
        exit_codes=[0], sandbox_id=graph.get_state(CONFIG).values["sandbox_id"]
    )
    result = graph.invoke(
        Command(resume=True), config=CONFIG, context=RunContext(reconnected, model=None)
    )

    assert result["tests_passed"] is True
    assert result["step_index"] == 2  # both plan steps ran before verify
    assert reconnected.runs == 1  # verify ran on the reconnected handle
    assert "Tests pass after 1 iteration" in result["summary"]


def test_replan_stops_after_max_iterations(graph) -> None:
    sandbox = FakeSandbox(exit_codes=[1])  # never goes green
    context = RunContext(sandbox, model=None)
    result = graph.invoke({}, config=CONFIG, context=context)
    while "__interrupt__" in result:
        result = graph.invoke(Command(resume=True), config=CONFIG, context=context)

    assert result["tests_passed"] is False
    assert result["iterations"] == main.MAX_ITERATIONS
    assert "still failing" in result["summary"]


def test_rejected_plan_changes_nothing(graph) -> None:
    sandbox = FakeSandbox(exit_codes=[1])
    context = RunContext(sandbox, model=None)
    result = graph.invoke({}, config=CONFIG, context=context)
    result = graph.invoke(Command(resume=False), config=CONFIG, context=context)

    assert result["summary"].startswith("Plan rejected")
    assert sandbox.runs == 1  # only the baseline run
