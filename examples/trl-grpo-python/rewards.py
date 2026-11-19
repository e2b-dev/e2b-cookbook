"""Native TRL async rewards with an explicitly owned pool of E2B workers."""

import ast
import asyncio
import contextlib
import json
import logging
import re
import time
import uuid
from pathlib import Path

import httpx
from e2b import (
    AsyncSandbox,
    RateLimitException,
    SandboxNotFoundException,
    SandboxQuery,
    SandboxState,
    ServiceBusyException,
    TimeoutException,
)

SANDBOX_TTL = 600
LOGGER = logging.getLogger(__name__)
REMOTE = "/opt/e2b-reward"
ISOLATE = (
    "/usr/bin/timeout --signal=KILL 2s "
    "unshare --mount --pid --fork --kill-child=KILL --net --ipc --mount-proc "
    f"bash {REMOTE}/isolated_run.sh"
)
EXECUTE = f"python3 -I -B {REMOTE}/evaluate.py"
TRANSIENT = (
    TimeoutException,
    SandboxNotFoundException,
    ServiceBusyException,
    RateLimitException,
    httpx.TransportError,
    ConnectionError,
)


def extract_code(completion):
    text = completion if isinstance(completion, str) else completion[-1]["content"]
    match = re.search(r"```(?:python)?[ \t]*\r?\n(.*?)\r?\n```", text, re.DOTALL)
    if not match:
        return None
    code = match.group(1)
    if len(code.encode()) > 65536:
        return None
    try:
        ast.parse(code)
    except (SyntaxError, ValueError):
        return None
    return code


def canonical_json(text):
    # Preserve JSON types: true and 1, or 1.0 and 1, are different results.
    return json.dumps(json.loads(text), sort_keys=True, allow_nan=False)


def matches_output(actual, expected):
    if len(actual.encode()) > 65536:
        return False
    try:
        return canonical_json(actual) == canonical_json(expected)
    except (ValueError, TypeError, RecursionError):
        return False


class RewardPool:
    """Reuse VMs; each test runs in fresh, unprivileged Linux namespaces."""

    def __init__(self, workers=2, create_interval=1.0):
        if workers < 1 or create_interval < 0.2:
            raise ValueError(
                "Workers must be positive; creation interval must be >= 0.2s"
            )
        self.workers = workers
        self.create_interval = create_interval
        self.run_id = uuid.uuid4().hex
        self._queue = asyncio.Queue()
        self._start_lock = asyncio.Lock()
        self._create_lock = asyncio.Lock()
        self._owned = {}
        self._last_create = 0.0
        self._loop = None
        self._started = self._closed = False
        self._failure = self._heartbeat = None
        self._timings = {}
        self._worker_seconds = 0.0
        self._last_reported_worker_seconds = 0.0
        self.created = self.retries = 0

    def _observe(self, name, seconds):
        value = self._timings.setdefault(name, {"count": 0, "total": 0.0, "max": 0.0})
        value["count"] += 1
        value["total"] += seconds
        value["max"] = max(value["max"], seconds)

    def metrics(self):
        return {
            "workers_created": self.created,
            "infrastructure_retries": self.retries,
            "worker_seconds_estimate": self._worker_seconds
            + sum(time.monotonic() - start for _, start in self._owned.values()),
            "timings": {
                name: {
                    "count": value["count"],
                    "mean_seconds": value["total"] / value["count"],
                    "max_seconds": value["max"],
                }
                for name, value in self._timings.items()
            },
        }

    async def _discard(self, sandbox):
        with contextlib.suppress(SandboxNotFoundException):
            await sandbox.kill(request_timeout=15)
        _, started = self._owned.pop(sandbox.sandbox_id)
        self._worker_seconds += time.monotonic() - started
        LOGGER.info("Removed sandbox %s (run %s)", sandbox.sandbox_id, self.run_id)

    async def _new_worker(self):
        for attempt in range(2):
            sandbox = None
            try:
                async with self._create_lock:
                    delay = self.create_interval - (
                        time.monotonic() - self._last_create
                    )
                    if delay > 0:
                        await asyncio.sleep(delay)
                    self._last_create = time.monotonic()
                    started = time.monotonic()
                    sandbox = await AsyncSandbox.create(
                        timeout=SANDBOX_TTL,
                        secure=True,
                        allow_internet_access=False,
                        lifecycle={"on_timeout": "kill"},
                        metadata={
                            "integration": "trl-grpo-cookbook",
                            "run": self.run_id,
                        },
                        request_timeout=15,
                    )
                self._owned[sandbox.sandbox_id] = (sandbox, started)
                self.created += 1
                LOGGER.info(
                    "Created sandbox %s (run %s)", sandbox.sandbox_id, self.run_id
                )
                self._observe("sandbox_create", time.monotonic() - started)
                await sandbox.commands.run(
                    f"install -d -m 755 {REMOTE}",
                    user="root",
                    timeout=10,
                    request_timeout=15,
                )
                await sandbox.files.write(
                    f"{REMOTE}/isolated_run.sh",
                    Path(__file__).with_name("isolated_run.sh").read_text(),
                    user="root",
                    request_timeout=15,
                )
                await sandbox.files.write(
                    f"{REMOTE}/evaluate.py",
                    Path(__file__).with_name("evaluate.py").read_text(),
                    user="root",
                    request_timeout=15,
                )
                await sandbox.files.write(
                    f"{REMOTE}/probe.py",
                    "import os\n"
                    "assert os.getuid() == 65534\n"
                    "assert os.statvfs('/').f_flag & os.ST_RDONLY\n"
                    "assert [p for p in os.listdir('/proc') if p.isdigit()] == ['1']\n"
                    "open('/tmp/.e2b-reward-probe', 'w').close()\n"
                    "open('/dev/shm/.e2b-reward-probe', 'w').close()\n"
                    "print('ready')\n",
                    user="root",
                    request_timeout=15,
                )
                await sandbox.commands.run(
                    f"chmod 555 {REMOTE}/isolated_run.sh; chmod 444 {REMOTE}/probe.py",
                    user="root",
                    timeout=10,
                )
                result = await sandbox.commands.run(
                    f"{ISOLATE} {REMOTE}/probe.py 3>/dev/null "
                    "&& test ! -e /tmp/.e2b-reward-probe "
                    "&& test ! -e /dev/shm/.e2b-reward-probe",
                    user="root",
                    timeout=10,
                    request_timeout=15,
                )
                if result.stdout.strip() != "ready":
                    raise RuntimeError("Worker isolation preflight failed")
                return sandbox
            except TRANSIENT:
                if sandbox is not None:
                    await self._discard(sandbox)
                if attempt == 1:
                    raise
                self.retries += 1
                await asyncio.sleep(self.create_interval)

    async def _keep_alive(self):
        try:
            while True:
                await asyncio.sleep(SANDBOX_TTL / 3)
                await asyncio.gather(
                    *(
                        s.set_timeout(SANDBOX_TTL, request_timeout=15)
                        for s, _ in self._owned.values()
                    )
                )
        except Exception as exc:
            self._failure = exc
            LOGGER.error(
                "Pool lifetime refresh failed (run %s): %s",
                self.run_id,
                type(exc).__name__,
            )

    async def _start(self):
        async with self._start_lock:
            if self._closed:
                raise RuntimeError("Reward pool is closed")
            if self._failure:
                raise self._failure
            loop = asyncio.get_running_loop()
            if self._loop is not None and self._loop is not loop:
                raise RuntimeError("Evaluate a reward pool on one event loop")
            self._loop = loop
            if self._started:
                return
            started = time.monotonic()
            try:
                for _ in range(self.workers):
                    self._queue.put_nowait(await self._new_worker())
                self._started = True
                self._heartbeat = asyncio.create_task(self._keep_alive())
                self._observe("pool_startup", time.monotonic() - started)
            except BaseException as exc:
                self._failure = exc
                raise

    async def _evaluate(self, code, cases):
        if code is None:
            return 0.0
        sandbox = await self._queue.get()
        try:
            for attempt in range(2):
                try:
                    if sandbox is None:
                        sandbox = await self._new_worker()
                    await sandbox.set_timeout(SANDBOX_TTL, request_timeout=15)
                    await sandbox.files.write(
                        f"{REMOTE}/solution.py", code, user="root"
                    )
                    await sandbox.files.write(
                        f"{REMOTE}/inputs.json",
                        json.dumps([case["input"] for case in cases]),
                        user="root",
                        request_timeout=15,
                    )
                    started = time.monotonic()
                    result = await sandbox.commands.run(
                        EXECUTE,
                        user="root",
                        timeout=2 * len(cases) + 10,
                        request_timeout=15,
                    )
                    self._observe(
                        "candidate_execution_roundtrip", time.monotonic() - started
                    )
                    outputs = json.loads(result.stdout)
                    passed = 0
                    for output, case in zip(outputs, cases, strict=True):
                        self._observe("case_execution_remote", output["seconds"])
                        passed += output["exit_code"] == 0 and matches_output(
                            output["output"], case["output"]
                        )
                    return passed / len(cases)
                except TRANSIENT:
                    if sandbox is not None:
                        await self._discard(sandbox)
                        sandbox = None
                    if attempt == 1:
                        raise
                    self.retries += 1
        finally:
            self._queue.put_nowait(sandbox)

    async def code_reward(self, completions, test_cases, **kwargs):
        started = time.monotonic()
        if self._closed:
            raise RuntimeError("Reward pool is closed")
        if self._failure:
            raise self._failure
        prepared = []
        for completion, cases in zip(completions, test_cases, strict=True):
            if not cases:
                raise ValueError("Each task needs at least one test case")
            for case in cases:
                json.loads(case["input"])
                canonical_json(case["output"])
            prepared.append((extract_code(completion), cases))
        if not any(code is not None for code, _ in prepared):
            self._record_batch(started, kwargs.get("log_metric"))
            return [0.0] * len(prepared)
        await self._start()
        try:
            results = await asyncio.gather(
                *(self._evaluate(code, cases) for code, cases in prepared),
                return_exceptions=True,
            )
        except BaseException as exc:
            # Local cancellation cannot certify that remote work stopped.
            self._failure = exc
            raise
        for result in results:
            if isinstance(result, BaseException):
                self._failure = result
                raise result
        if self._failure:
            raise self._failure
        self._record_batch(started, kwargs.get("log_metric"))
        return results

    def _record_batch(self, started, log_metric):
        elapsed = time.monotonic() - started
        self._observe("reward_batch", elapsed)
        worker_seconds = self.metrics()["worker_seconds_estimate"]
        if log_metric is not None:
            log_metric("e2b/reward_seconds", elapsed)
            log_metric(
                "e2b/worker_seconds_since_previous_reward",
                worker_seconds - self._last_reported_worker_seconds,
            )
        self._last_reported_worker_seconds = worker_seconds

    async def close(self):
        # TRL owns a dedicated async loop; shutdown must use the clients' owning loop.
        if self._loop is not None and self._loop is not asyncio.get_running_loop():
            if not self._loop.is_running():
                raise RuntimeError("Close the reward pool before its event loop stops")
            await asyncio.wrap_future(
                asyncio.run_coroutine_threadsafe(self.close(), self._loop)
            )
            return
        self._closed = True
        if self._loop is None:
            return
        if self._heartbeat is not None:
            self._heartbeat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._heartbeat
        await asyncio.gather(
            *(self._discard(s) for s, _ in list(self._owned.values())),
            return_exceptions=True,
        )
        # Metadata also finds allocations whose create response was lost.
        pager = AsyncSandbox.list(
            query=SandboxQuery(
                metadata={"integration": "trl-grpo-cookbook", "run": self.run_id},
                state=[SandboxState.RUNNING, SandboxState.PAUSED],
            ),
            request_timeout=15,
        )
        while pager.has_next:
            for item in await pager.next_items():
                with contextlib.suppress(SandboxNotFoundException):
                    await AsyncSandbox.kill(item.sandbox_id, request_timeout=15)
        pager = AsyncSandbox.list(query=pager.query, request_timeout=15)
        remaining = []
        while pager.has_next:
            remaining.extend(item.sandbox_id for item in await pager.next_items())
        if remaining:
            raise RuntimeError(f"Cleanup incomplete for run {self.run_id}: {remaining}")
        for _, started in self._owned.values():
            self._worker_seconds += time.monotonic() - started
        self._owned.clear()
