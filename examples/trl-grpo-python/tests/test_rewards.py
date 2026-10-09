import asyncio
import json
from types import SimpleNamespace

import pytest
from e2b import CommandExitException

import rewards
from tasks import EVAL_TASKS, TRAIN_TASKS

COMPLETION = "```python\nprint('{}')\n```"
CASES = [{"input": "[]", "output": "{}"}]


@pytest.mark.parametrize(
    "actual,expected,correct",
    [
        ('{"a": 1, "b": 2}\n', '{"b": 2, "a": 1}', True),
        ('{"a": 1}', '{"a": 1, "b": 2}', False),
        ('{"a": 1}\n{"b": 2}', '{"a": 1}', False),
        ('{"a": true}', '{"a": 1}', False),
        ('{"a": 1.0}', '{"a": 1}', False),
        ('{"a": NaN}', '{"a": 1}', False),
        ("x" * 65537, "{}", False),
        ("[" * 2000 + "0" + "]" * 2000, "{}", False),
    ],
)
def test_entire_typed_json_result_is_graded(actual, expected, correct):
    assert rewards.matches_output(actual, expected) is correct


@pytest.fixture
def backend(monkeypatch):
    state = SimpleNamespace(
        active=0,
        maximum=0,
        created=[],
        killed=[],
        options=[],
        fail=None,
        once=False,
        wait=False,
        live={},
        refreshes=0,
        commands=0,
    )

    class Sandbox:
        def __init__(self, index):
            self.sandbox_id = str(index)
            self.files = self.commands = self
            self.code = ""
            self.inputs = []

        async def kill(self, **kwargs):
            if state.fail == "cleanup":
                raise OSError("cleanup failed")
            state.live.pop(self.sandbox_id, None)
            state.killed.append(self.sandbox_id)

        async def set_timeout(self, *args, **kwargs):
            state.refreshes += 1
            if self.sandbox_id not in state.live:
                raise rewards.SandboxNotFoundException("expired")

        async def write(self, path, content, **kwargs):
            if state.fail == "upload":
                raise OSError("upload failed")
            if path.endswith("solution.py"):
                self.code = content
            if path.endswith("inputs.json"):
                self.inputs = json.loads(content)

        async def run(self, command, **kwargs):
            if command != rewards.EXECUTE:
                return SimpleNamespace(stdout="ready")
            state.active += 1
            state.maximum = max(state.maximum, state.active)
            try:
                if state.wait:
                    await asyncio.sleep(10)
                await asyncio.sleep(0.01)
                state.commands += 1
                if state.fail == "transport" or state.once:
                    state.once = False
                    raise ConnectionError("transport failed")
                if state.fail == "supervisor":
                    raise CommandExitException("", "", 1, None)
                return SimpleNamespace(
                    stdout=json.dumps(
                        [
                            {
                                "exit_code": 137 if "bad" in self.code else 0,
                                "output": "{}",
                                "seconds": 0.01,
                            }
                            for _ in self.inputs
                        ]
                    )
                )
            finally:
                state.active -= 1

    async def create(**options):
        if state.fail == "create":
            raise ConnectionError("create failed")
        state.options.append(options)
        sandbox = Sandbox(len(state.created))
        state.created.append(sandbox.sandbox_id)
        state.live[sandbox.sandbox_id] = sandbox
        return sandbox

    class Pager:
        def __init__(self, query, **kwargs):
            self.query = query
            self.has_next = True

        async def next_items(self):
            self.has_next = False
            return list(state.live.values())

    async def kill(sandbox_id, **kwargs):
        await state.live[sandbox_id].kill()

    monkeypatch.setattr(rewards.AsyncSandbox, "create", create)
    monkeypatch.setattr(rewards.AsyncSandbox, "list", Pager)
    monkeypatch.setattr(rewards.AsyncSandbox, "kill", kill)
    return state


async def evaluate(completions, cases, pool=None):
    pool = pool or rewards.RewardPool(create_interval=0.2)
    try:
        return await pool.code_reward(completions, cases)
    finally:
        await pool.close()


def test_bounded_concurrency_order_reuse_and_cleanup(backend):
    async def run():
        pool = rewards.RewardPool(create_interval=0.2)
        try:
            cases = [CASES, [{"input": "[]", "output": "[]"}], CASES, CASES]
            assert await pool.code_reward([COMPLETION] * 4, cases) == [1, 0, 1, 1]
            assert await pool.code_reward([COMPLETION], [CASES]) == [1]
            assert len(backend.created) == 2
            assert backend.maximum == 2
            assert len(backend.live) == 2
            assert pool.metrics()["timings"]["reward_batch"]["count"] == 2
        finally:
            await pool.close()
        assert not backend.live
        assert pool.metrics()["worker_seconds_estimate"] > 0

    asyncio.run(run())
    assert sorted(backend.killed) == backend.created
    assert all(o["allow_internet_access"] is False for o in backend.options)
    assert all(o["secure"] is True for o in backend.options)
    assert all(o["lifecycle"] == {"on_timeout": "kill"} for o in backend.options)
    assert all("envs" not in o and "api_key" not in o for o in backend.options)


@pytest.mark.parametrize(
    "failure", ["create", "upload", "transport", "cleanup", "supervisor"]
)
def test_backend_failures_propagate_instead_of_rewards(backend, failure):
    backend.fail = failure
    with pytest.raises((OSError, ConnectionError, CommandExitException)):
        asyncio.run(evaluate([COMPLETION] * 3, [CASES] * 3))
    if failure != "cleanup":
        assert not backend.live
    assert backend.active == 0


def test_transient_replaces_worker_once_without_false_zero(backend):
    backend.once = True
    pool = rewards.RewardPool(workers=1, create_interval=0.2)
    assert asyncio.run(evaluate([COMPLETION], [CASES], pool)) == [1]
    assert pool.retries == 1
    assert len(backend.created) == 2
    assert not backend.live


def test_expired_worker_is_replaced(backend):
    async def run():
        pool = rewards.RewardPool(workers=1, create_interval=0.2)
        try:
            assert await pool.code_reward([COMPLETION], [CASES]) == [1]
            backend.live.clear()
            assert await pool.code_reward([COMPLETION], [CASES]) == [1]
            assert len(backend.created) == 2
        finally:
            await pool.close()

    asyncio.run(run())
    assert not backend.live


def test_runtime_failure_scores_zero(backend):
    assert asyncio.run(evaluate(["```python\nprint('bad')\n```"], [CASES])) == [0]
    assert not backend.live


def test_invalid_candidate_needs_no_sandbox(backend):
    completions = ["no code", "```python\nnot valid Python\n```"]
    assert asyncio.run(evaluate(completions, [CASES] * 2)) == [0, 0]
    assert not backend.created


def test_conversational_completions(backend):
    completion = [{"role": "assistant", "content": COMPLETION}]
    assert asyncio.run(evaluate([completion], [CASES])) == [1]


@pytest.mark.parametrize("cases", [[], [{"input": "[]", "output": "not JSON"}]])
def test_invalid_task_fails_before_allocating(backend, cases):
    with pytest.raises(ValueError):
        asyncio.run(evaluate([COMPLETION], [cases]))
    assert not backend.created


def test_mismatched_batch_fails_before_allocating(backend):
    with pytest.raises(ValueError):
        asyncio.run(evaluate([COMPLETION] * 2, [CASES]))
    assert not backend.created


@pytest.mark.parametrize("workers,interval", [(0, 1), (1, 0.1)])
def test_invalid_pool_configuration(workers, interval):
    with pytest.raises(ValueError):
        rewards.RewardPool(workers, interval)


def test_cancellation_drains_tasks_and_explicit_close_kills(backend):
    backend.wait = True

    async def cancel():
        pool = rewards.RewardPool(create_interval=0.2)
        try:
            await pool._start()
            with pytest.raises(TimeoutError):
                await asyncio.wait_for(
                    pool.code_reward([COMPLETION] * 3, [CASES] * 3), 0.05
                )
            assert backend.active == 0
            with pytest.raises(asyncio.CancelledError):
                await pool.code_reward([COMPLETION], [CASES])
        finally:
            await pool.close()

    asyncio.run(cancel())
    assert not backend.live
    assert sorted(backend.killed) == backend.created


def test_closed_pool_rejects_evaluation(backend):
    async def run():
        pool = rewards.RewardPool()
        await pool.close()
        with pytest.raises(RuntimeError, match="closed"):
            await pool.code_reward([COMPLETION], [CASES])

    asyncio.run(run())
    assert not backend.created


def test_task_splits_and_serialized_schema():
    assert {t["task_id"] for t in TRAIN_TASKS}.isdisjoint(
        {t["task_id"] for t in EVAL_TASKS}
    )
    for task in TRAIN_TASKS + EVAL_TASKS:
        assert task["test_cases"]
        for case in task["test_cases"]:
            assert isinstance(case["input"], str)
            assert isinstance(case["output"], str)
            rewards.canonical_json(case["input"])
            rewards.canonical_json(case["output"])


def test_prompts_specify_all_input_field_names():
    for task in TRAIN_TASKS + EVAL_TASKS:
        prompt = task["prompt"][0]["content"]
        fields = {
            field
            for case in task["test_cases"]
            for record in json.loads(case["input"])
            for field in record
        }
        assert fields
        assert all(f'"{field}"' in prompt for field in fields), task["task_id"]


def test_close_runs_on_trl_style_owning_loop(backend):
    import threading

    loop = asyncio.new_event_loop()
    thread = threading.Thread(target=loop.run_forever)
    thread.start()
    pool = rewards.RewardPool(workers=1, create_interval=0.2)
    try:
        future = asyncio.run_coroutine_threadsafe(
            pool.code_reward([COMPLETION], [CASES]), loop
        )
        assert future.result(timeout=3) == [1]
        asyncio.run(pool.close())
        assert not backend.live
    finally:
        loop.call_soon_threadsafe(loop.stop)
        thread.join()
        loop.close()


def test_native_trl_metrics_include_idle_worker_time(backend):
    async def run():
        pool = rewards.RewardPool(workers=1, create_interval=0.2)
        logged = {}
        try:
            await pool.code_reward([COMPLETION], [CASES], log_metric=logged.__setitem__)
            assert logged["e2b/reward_seconds"] > 0
            await asyncio.sleep(0.02)
            assert await pool.code_reward(
                ["no code"], [CASES], log_metric=logged.__setitem__
            ) == [0]
            assert logged["e2b/worker_seconds_since_previous_reward"] >= 0.02
        finally:
            await pool.close()

    asyncio.run(run())


def test_lifetime_refresh_runs_between_callbacks(backend, monkeypatch):
    monkeypatch.setattr(rewards, "SANDBOX_TTL", 0.06)

    async def run():
        pool = rewards.RewardPool(workers=1, create_interval=0.2)
        try:
            assert await pool.code_reward([COMPLETION], [CASES]) == [1]
            previous = backend.refreshes
            await asyncio.sleep(0.06)
            assert backend.refreshes > previous
        finally:
            await pool.close()

    asyncio.run(run())
