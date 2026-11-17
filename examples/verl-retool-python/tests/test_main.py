import asyncio

from verl.tools.schemas import ToolResponse

from main import TRAJECTORIES, run_trajectory
from recipe.retool.retool import normalize_code


class LocalTool:
    """Stands in for the E2B tool: runs the normalized code in this process. Offline only."""

    def __init__(self):
        self.calls = []

    async def create(self):
        return "id", ToolResponse()

    async def execute(self, instance_id, parameters):
        code = normalize_code(parameters["code"])
        self.calls.append(code)
        lines = []
        try:
            exec(code, {"print": lambda *a: lines.append(" ".join(map(str, a)))})
        except Exception as exc:
            lines.append(f"{type(exc).__name__}: {exc}")
        return ToolResponse(text="\n".join(lines) + "\n"), 0.0, {}

    async def release(self, instance_id):
        pass


def run_all():
    tool = LocalTool()
    return tool, [asyncio.run(run_trajectory(tool, t)) for t in TRAJECTORIES]


def test_scripted_rewards_and_turns():
    tool, results = run_all()
    assert {r.name: r.reward for r in results} == {"remainder": 1.0, "fix-after-error": 1.0, "wrong-answer": -0.9}
    assert [r.num_turns for r in results] == [4, 6, 4]
    assert len(tool.calls) == 4


def test_policy_reads_its_answer_from_the_tool_output():
    _, results = run_all()
    fix = results[1]
    assert fix.tool_outputs[0].startswith("NameError")
    assert fix.answer == "400"
