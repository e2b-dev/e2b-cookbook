"""Exercise actual E2B rewards and reconcile cleanup; no model or GPU needed."""

import asyncio
import json
import logging
import os
import time

from e2b import AsyncSandbox, SandboxQuery, SandboxState

from rewards import RewardPool
from tasks import TRAIN_TASKS

CORRECT_CODE = """import json, sys
totals = {}
for record in json.load(sys.stdin):
    customer = record['customer']
    totals[customer] = totals.get(customer, 0) + record['tokens']
print(json.dumps(totals))
"""


async def main():
    if not os.environ.get("E2B_API_KEY"):
        raise SystemExit("Set E2B_API_KEY on the evaluator host before running")
    candidates = {
        "correct": CORRECT_CODE,
        "wrong": "print('[]')",
        "partial": "print('{}')",
        "syntax_error": "this is invalid Python",
        "timeout": "while True: pass",
    }
    pool = RewardPool()
    started = time.monotonic()
    try:
        scores = await pool.code_reward(
            [f"```python\n{code}\n```" for code in candidates.values()],
            [TRAIN_TASKS[0]["test_cases"]] * len(candidates),
        )
        expected = [1.0, 0.0, 1 / 3, 0.0, 0.0]
        assert scores == expected, scores
        assert await pool.code_reward(
            [f"```python\n{CORRECT_CODE}\n```"],
            [TRAIN_TASKS[0]["test_cases"]],
        ) == [1.0]
        assert pool.created == 2, "Healthy workers should be reused across callbacks"
        print(json.dumps(dict(zip(candidates, scores, strict=True)), indent=2))
        print(f"Evaluation took {time.monotonic() - started:.2f}s (not a benchmark)")
    finally:
        await pool.close()
        query = SandboxQuery(
            metadata={"integration": "trl-grpo-cookbook", "run": pool.run_id},
            state=[SandboxState.RUNNING, SandboxState.PAUSED],
        )
        paginator = AsyncSandbox.list(query=query, request_timeout=15)
        remaining = []
        while paginator.has_next:
            remaining.extend(await paginator.next_items())
        if remaining:
            ids = [sandbox.sandbox_id for sandbox in remaining]
            raise RuntimeError(f"Cleanup incomplete for run {pool.run_id}: {ids}")
        print(f"No running or paused sandboxes remain for run {pool.run_id}")
        print(json.dumps({"pool": pool.metrics()}, indent=2))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    asyncio.run(main())
