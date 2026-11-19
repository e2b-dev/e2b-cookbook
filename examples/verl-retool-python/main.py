"""Replay scripted ReTool trajectories through the recipe's E2B tool and score them with the recipe's reward.

No GPU or model: a fixed policy writes the code and reads the tool output, the way a trained model would.
"""

import argparse
import asyncio
import json
import statistics
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from e2b import AsyncSandbox, SandboxQuery, SandboxState
from verl.tools.tool_registry import initialize_tools_from_config

from recipe.retool.e2b_sandbox_tool import UNAVAILABLE_TEXT
from recipe.retool.retool import compute_score

TOOL_CONFIG = Path(__file__).parent / "recipe" / "retool" / "e2b_tool_config.yaml"


@dataclass
class Trajectory:
    """One math problem, the code a policy writes for it, and how it turns the last tool output into an answer."""

    name: str
    question: str
    ground_truth: str
    code_turns: list[str]
    answer_offset: int = 0  # A non-zero offset makes the policy box a wrong number on purpose.


TRAJECTORIES = [
    Trajectory(
        name="remainder",
        question="What is the remainder when 7^2026 is divided by 1000?",
        ground_truth="649",
        code_turns=["pow(7, 2026, 1000)"],
    ),
    Trajectory(
        name="fix-after-error",
        question="How many positive integers n <= 1000 make n^2 + 1 divisible by 5?",
        ground_truth="400",
        code_turns=[
            "count = sum(1 for n in range(1, 1001) if (n**2 + 1) % 5 == 0)\ncont",
            "count = sum(1 for n in range(1, 1001) if (n**2 + 1) % 5 == 0)\ncount",
        ],
    ),
    Trajectory(
        name="wrong-answer",
        question="What is the sum of the digits of 2^100?",
        ground_truth="115",
        code_turns=["sum(int(d) for d in str(2**100))"],
        answer_offset=1,
    ),
]


@dataclass
class Result:
    name: str
    reward: float
    num_turns: int
    answer: str
    tool_outputs: list[str] = field(default_factory=list)
    call_seconds: list[float] = field(default_factory=list)


async def call_tool(tool, code: str) -> tuple[str, float]:
    """Run one tool call the way verl's ToolAgentLoop does: create, execute, release."""
    started = time.monotonic()
    instance_id, _ = await tool.create()
    try:
        response, _, _ = await tool.execute(instance_id, {"code": code})
    finally:
        await tool.release(instance_id)
    return response.text, time.monotonic() - started


async def run_trajectory(tool, trajectory: Trajectory) -> Result:
    transcript = [trajectory.question]
    result = Result(trajectory.name, 0.0, 0, "")
    for code in trajectory.code_turns:
        output, seconds = await call_tool(tool, code)
        result.tool_outputs.append(output)
        result.call_seconds.append(seconds)
        transcript.append(
            f"<tool_call>{json.dumps({'name': 'code_interpreter', 'arguments': {'code': code}})}</tool_call>"
        )
        transcript.append(f"<tool_response>{output}</tool_response>")

    last_line = result.tool_outputs[-1].strip().splitlines()[-1]
    try:
        result.answer = str(int(last_line) + trajectory.answer_offset)
    except ValueError:
        result.answer = last_line
    transcript.append(f"The answer is \\boxed{{{result.answer}}}.")

    # verl counts each generation and each tool response as a turn, plus the prompt.
    tool_turns = len(trajectory.code_turns)
    result.num_turns = (tool_turns + 1) + tool_turns + 1
    score = compute_score(
        data_source="scripted",
        solution_str="\n".join(transcript),
        ground_truth=trajectory.ground_truth,
        extra_info={"num_turns": result.num_turns},
    )
    result.reward = round(score["score"], 4)
    return result


def load_tool(run_tag: str, pool_size: int):
    """Load the recipe's E2B tool config through verl's own registry, with a pool size and a run tag."""
    config = yaml.safe_load(TOOL_CONFIG.read_text())
    config["tools"][0]["config"].update(pool_size=pool_size, metadata={"cookbook-run": run_tag})
    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as handle:
        yaml.safe_dump(config, handle)
    try:
        return initialize_tools_from_config(handle.name)[0]
    finally:
        Path(handle.name).unlink()


async def tagged_sandboxes(run_tag: str):
    query = SandboxQuery(metadata={"cookbook-run": run_tag}, state=[SandboxState.RUNNING, SandboxState.PAUSED])
    paginator = AsyncSandbox.list(query=query)
    items = []
    while paginator.has_next:
        items += await paginator.next_items()
    return items


async def main(copies: int, pool_size: int) -> dict:
    run_tag = uuid.uuid4().hex[:12]
    tool = load_tool(run_tag, pool_size)
    started = time.monotonic()
    try:
        results = await asyncio.gather(*(run_trajectory(tool, t) for t in TRAJECTORIES for _ in range(copies)))
        elapsed = time.monotonic() - started
        # The sandbox list can lag a few seconds behind creation.
        await asyncio.sleep(3)
        pool = await tagged_sandboxes(run_tag)
    finally:
        await tool.close()

    await asyncio.sleep(3)
    left = await tagged_sandboxes(run_tag)
    for item in left:
        await AsyncSandbox.kill(item.sandbox_id)

    for result in results[::copies]:
        print(f"== {result.name}: reward {result.reward}, num_turns {result.num_turns}")
        for output in result.tool_outputs:
            print("   tool:", output.strip().splitlines()[-1])
        print("   boxed answer:", result.answer)

    seconds = [s for r in results for s in r.call_seconds]
    return {
        "run_tag": run_tag,
        "rewards": {r.name: r.reward for r in results[::copies]},
        "rewards_match_across_copies": all(r.reward == results[i - i % copies].reward for i, r in enumerate(results)),
        "trajectories": len(results),
        "tool_calls": len(seconds),
        "unavailable_calls": sum(o == UNAVAILABLE_TEXT for r in results for o in r.tool_outputs),
        "pool_size": pool_size,
        "sandboxes_in_pool": len(pool),
        "call_seconds": {
            "min": round(min(seconds), 3),
            "median": round(statistics.median(seconds), 3),
            "max": round(max(seconds), 3),
        },
        "elapsed_seconds": round(elapsed, 3),
        "sandboxes_left_after_close": len(left),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--copies", type=int, default=4, help="concurrent copies of each trajectory")
    parser.add_argument("--pool-size", type=int, default=2, help="sandboxes the tool may keep")
    args = parser.parse_args()
    receipt = asyncio.run(main(args.copies, args.pool_size))
    print(json.dumps(receipt, indent=2))
    if receipt["unavailable_calls"]:
        # In training this text reaches the model; here it would only make the rewards meaningless.
        raise SystemExit("E2B could not run some calls; see the warning logged above (API key, template, limits).")
    if receipt["sandboxes_left_after_close"]:
        raise SystemExit("Sandboxes were still running after close and were killed; see run_tag.")
