"""Opt-in E2B execution, scripted DSPy actions, no model-provider requests."""

import concurrent.futures
import json
import logging
import os
import time
from pathlib import Path

import dspy
import pytest
from e2b import Sandbox, SandboxQuery

from dspy_e2b import E2BInterpreter
from main import QUERY, IncidentAnalysis, assess_fixture

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(os.getenv("E2B_LIVE") != "1", reason="opt-in E2B resources"),
]


class Actions:
    def __init__(self, codes):
        self.codes = iter(codes)

    def __call__(self, **kwargs):
        return dspy.Prediction(reasoning="scripted E2B contract validation", code=next(self.codes))


SQL_SETUP = """import sqlite3
conn=sqlite3.connect(':memory:')
conn.execute('CREATE TABLE incidents(id TEXT, service TEXT, region TEXT, '
             'status TEXT, severity TEXT, summary TEXT)')
conn.executemany('INSERT INTO incidents VALUES (?,?,?,?,?,?)',
    [(r['id'],r['service'],r['region'],r['status'],r['severity'],r['summary']) for r in records])
candidates=list(conn.execute("SELECT id,summary FROM incidents WHERE service='inference' "
                             "AND status='resolved' AND severity='high' ORDER BY id"))
print([r[0] for r in candidates])"""
SEMANTICS = """labels=llm_query_batched([r[1] for r in candidates])
selected=[r[0] for r,label in zip(candidates,labels) if label=='queue']
conn.execute('CREATE TABLE selected(id TEXT)')
conn.executemany('INSERT INTO selected VALUES (?)', [(i,) for i in selected])
counts=dict(conn.execute('SELECT region,count(*) FROM incidents JOIN selected USING(id) GROUP BY region'))
print(counts)"""
SUBMIT = """SUBMIT(candidate_ids=[r[0] for r in candidates], queue_incident_ids=selected,
counts_by_region=counts, summary='Scripted fixture classification; no real model was called.')"""


def test_live_contract_and_reconciliation():
    owned = []
    checks = []
    records = json.loads(Path(__file__).parents[1].joinpath("fixtures/incidents.json").read_text())

    def factory():
        value = E2BInterpreter()
        owned.append(value)
        return value

    factory.execution_instructions = E2BInterpreter.execution_instructions
    try:
        rlm = dspy.RLM(IncidentAnalysis, interpreter_factory=factory, max_iters=3, max_llm_calls=4)
        rlm.generate_action = Actions([SQL_SETUP, SEMANTICS, SUBMIT])
        # Explicit fixture labels, not a semantic classifier or quality evaluation.
        rlm.sub_lm = lambda prompt: ["other" if "tokenizer" in prompt else "queue"]
        result = rlm(records=records, query=QUERY)
        assert assess_fixture(records, result)["fixture_semantic_labels_match"]
        assert result.counts_by_region == {"eu": 2, "us": 1}
        checks.append("real RLM, SQLite, four native batched host sub-queries, typed SUBMIT")

        def isolated(value):
            local = dspy.RLM("query: int -> answer: int", interpreter_factory=factory, max_iters=2)
            local.generate_action = Actions(
                [
                    "import os\nassert not os.path.exists('owned')\n"
                    "open('owned','w').write(str(query))\nremembered=query\nprint(remembered)",
                    "assert open('owned').read()==str(remembered)\nSUBMIT(answer=remembered)",
                ]
            )
            return local(query=value).answer

        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            assert sorted(pool.map(isolated, [41, 42])) == [41, 42]
        assert len({value.sandbox_id for value in owned}) == 3
        checks.append("two concurrent invocations: unique sandboxes, globals/files isolated")

        large = factory()
        data = {"payload": {"text": "x" * (12 * 1024 * 1024), "count": 1}}
        start = time.monotonic()
        assert large.execute("payload['count']=99\nlen(payload['text'])", data) == 12 * 1024 * 1024
        time.sleep(0.1)  # A host-side thinking gap between execution boundaries.
        assert large.execute("payload['count']", data) == 1
        data["payload"]["count"] = 2
        assert large.execute("payload['count']", data) == 2
        transfer_seconds = round(time.monotonic() - start, 3)
        for code, error in [("if", SyntaxError), ("1/0", dspy.CodeExecutionError)]:
            with pytest.raises(error):
                large.execute(code)
        assert large.execute("42") == 42
        large.shutdown()
        checks.append(
            "12 MiB SDK file transport, cache reuse/fresh assignment, changed input, recoverable errors"
        )

        for code in ["while True: pass", "import os\nos._exit(9)"]:
            failed = E2BInterpreter(execution_timeout=0.5)
            owned.append(failed)
            with pytest.raises(dspy.CodeInterpreterError) as caught:
                failed.execute(code)
            assert not isinstance(caught.value, dspy.CodeExecutionError)
            with pytest.raises(dspy.CodeInterpreterError):
                failed.execute("42")
        checks.append("infinite-loop deadline and worker death kill owned resources without replay")
    finally:
        cleanup_errors = []
        remaining = []
        for value in owned:
            try:
                value.shutdown()
            except Exception as exc:
                cleanup_errors.append({"sandbox_id": value.sandbox_id, "error_type": type(exc).__name__})
            paginator = Sandbox.list(
                query=SandboxQuery(metadata={"dspy_session": value.session_id}), request_timeout=20
            )
            while paginator.has_next:
                for sandbox in paginator.next_items():
                    remaining.append(sandbox.sandbox_id)
                    Sandbox.kill(sandbox.sandbox_id, request_timeout=20)
        receipt = {
            "coverage": "real E2B and native RLM; scripted actions/sub-model labels; no provider/model calls",
            "checks": checks,
            "large_input_seconds": locals().get("transfer_seconds"),
            "owned": [{"sandbox_id": value.sandbox_id, "session_id": value.session_id} for value in owned],
            "cleanup_errors": cleanup_errors,
            "remaining_running_or_paused_before_reconciliation": remaining,
        }
        if os.getenv("E2B_RECEIPT"):
            Path(os.environ["E2B_RECEIPT"]).write_text(json.dumps(receipt, indent=2) + "\n")
        assert not cleanup_errors and not remaining, receipt


def test_live_custom_tools_and_expired_session():
    owned = []

    def add(left: int, right: int) -> int:
        """Add integers on the host."""
        return left + right

    async def double(value: int) -> int:
        """Double an integer on an async host callable."""
        return value * 2

    def factory():
        value = E2BInterpreter()
        owned.append(value)
        return value

    factory.execution_instructions = E2BInterpreter.execution_instructions

    class ExpiringActions:
        calls = 0

        def __call__(self, **kwargs):
            self.calls += 1
            if self.calls == 1:
                code = "remembered=add(left=20,right=22)\nassert double(value=21)==42\nprint(remembered)"
            else:
                assert kwargs["repl_history"].entries[-1].output == "42"
                # Expire the lease during a model-thinking gap, before execute refreshes it.
                owned[0]._sandbox.set_timeout(1, request_timeout=20)
                time.sleep(2)
                code = "SUBMIT(answer=remembered)"
            return dspy.Prediction(reasoning="scripted lease-expiration check", code=code)

    rlm = dspy.RLM("query: str -> answer: int", tools=[add, double], interpreter_factory=factory, max_iters=2)
    rlm.generate_action = ExpiringActions()
    try:
        with pytest.raises(dspy.CodeInterpreterError):
            rlm(query="q")
        assert rlm.generate_action.calls == 2
        assert len(owned) == 1 and owned[0]._ended
        with pytest.raises(dspy.CodeInterpreterError):
            owned[0].execute("42")
        assert len(owned) == 1
    finally:
        remaining = []
        for value in owned:
            value.shutdown()
            paginator = Sandbox.list(
                query=SandboxQuery(metadata={"dspy_session": value.session_id}), request_timeout=20
            )
            while paginator.has_next:
                for sandbox in paginator.next_items():
                    remaining.append(sandbox.sandbox_id)
                    Sandbox.kill(sandbox.sandbox_id, request_timeout=20)
        receipt = {
            "coverage": "real E2B/native RLM; scripted actions; sync/async custom tools; no provider calls",
            "owned": [{"sandbox_id": v.sandbox_id, "session_id": v.session_id} for v in owned],
            "remaining": remaining,
        }
        if os.getenv("E2B_RECEIPT"):
            Path(os.environ["E2B_RECEIPT"]).write_text(json.dumps(receipt, indent=2) + "\n")
        assert not remaining


def test_live_review_regressions(caplog):
    owned, timings = [], {}

    def factory():
        value = E2BInterpreter()
        owned.append(value)
        return value

    factory.execution_instructions = E2BInterpreter.execution_instructions
    try:
        with caplog.at_level(logging.INFO, logger="httpx"):
            rlm = dspy.RLM(
                "records: list[dict] -> answer: int",
                interpreter_factory=factory,
                max_iters=3,
                max_output_chars=4000,
            )
            rlm.generate_action = Actions(
                [
                    "print(records)",
                    "records[0]['text']='mutated'\n"
                    "open('/home/user/.dspy-inputs.json','w').write('{}')\nprint('changed file')",
                    "SUBMIT(answer=len(records[0]['text']))",
                ]
            )
            result = rlm(records=[{"text": "x" * (13 * 1024 * 1024)}])
            assert result.answer == 13 * 1024 * 1024 and len(result.trajectory) == 3
            network = factory()
            network.start()
            for name, code in {
                "pip": "import subprocess\nsubprocess.run(['pip','install','pandas'], check=True, "
                "capture_output=True, text=True)",
                "dns": "import urllib.request\nurllib.request.urlopen('https://pypi.org')",
            }.items():
                started = time.monotonic()
                with pytest.raises(dspy.CodeExecutionError):
                    network.execute(code)
                timings[name] = round(time.monotonic() - started, 3)
                assert timings[name] < 8
                assert network.execute("42") == 42
            network.shutdown()
            assert not any("/health" in record.getMessage() for record in caplog.records)
    finally:
        remaining = []
        for value in owned:
            value.shutdown()
            paginator = Sandbox.list(
                query=SandboxQuery(metadata={"dspy_session": value.session_id}), request_timeout=20
            )
            while paginator.has_next:
                for sandbox in paginator.next_items():
                    remaining.append(sandbox.sandbox_id)
                    Sandbox.kill(sandbox.sandbox_id, request_timeout=20)
        receipt = {
            "coverage": "real E2B/native scripted RLM: 13 MiB stdout, overwritten input file, fast pip/DNS "
            "recovery, no health probe during orderly shutdown; no provider calls",
            "network_seconds": timings,
            "owned": [{"sandbox_id": v.sandbox_id, "session_id": v.session_id} for v in owned],
            "remaining": remaining,
        }
        if os.getenv("E2B_RECEIPT"):
            Path(os.environ["E2B_RECEIPT"]).write_text(json.dumps(receipt, indent=2) + "\n")
        assert not remaining
