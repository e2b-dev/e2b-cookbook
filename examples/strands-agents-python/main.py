"""A Strands Agents data analyst whose Python, shell, and file tools run in E2B."""

import asyncio
import csv
import io
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from e2b import AsyncSandbox
from strands import Agent
from strands.models.anthropic import AnthropicModel
from strands_e2b import E2BSandbox

load_dotenv()

WORKDIR = "/home/user/analysis"
MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]
REVENUE = {
    "north": [120, 135, 160, 150, 170, 165],
    "south": [200, 180, 175, 210, 190, 185],
    "west": [90, 110, 105, 130, 125, 140],
}
TASK = """sales.csv in your working directory has columns month, region, revenue.
Using Python (pandas and matplotlib are installed):
1. For each region, find the month with the highest revenue.
2. Save a line chart of monthly revenue per region to chart.png.
3. Write summary.json mapping each region to its best month, e.g. {"north": "2026-05"}.
Reply with a one-sentence summary."""


def sales_csv() -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["month", "region", "revenue"])
    for region, values in REVENUE.items():
        for month, revenue in zip(MONTHS, values, strict=True):
            writer.writerow([month, region, revenue])
    return out.getvalue()


async def main() -> None:
    # You own the sandbox. code-interpreter-v1 ships pandas and matplotlib; the
    # model runs on this machine, so the sandbox needs no internet access.
    sandbox = await AsyncSandbox.create("code-interpreter-v1", timeout=600, allow_internet_access=False)
    try:
        print(f"Sandbox: {sandbox.sandbox_id}", flush=True)
        workspace = E2BSandbox(sandbox, working_dir=WORKDIR)
        await workspace.write_text("sales.csv", sales_csv())  # also creates WORKDIR

        agent = Agent(
            model=AnthropicModel(model_id=os.getenv("MODEL", "claude-haiku-5-5"), max_tokens=4096),
            sandbox=workspace,
            system_prompt="You are a data analyst. Work only inside your sandbox tools.",
        )
        async with asyncio.timeout(300):
            result = await agent.invoke_async(TASK)
        print(f"\nTools used: {sorted(result.metrics.tool_metrics)}")

        # Check the artifacts instead of trusting the agent's reply.
        expected = {region: MONTHS[values.index(max(values))] for region, values in REVENUE.items()}
        summary = json.loads(await workspace.read_text("summary.json"))
        assert summary == expected, f"summary.json {summary} != expected {expected}"
        chart = await workspace.read_file("chart.png")
        assert chart.startswith(b"\x89PNG"), "chart.png is not a PNG"
        Path("chart.png").write_bytes(chart)
        print(f"Verified summary.json {summary}; saved chart.png ({len(chart)} bytes)")
    finally:
        await sandbox.kill()


if __name__ == "__main__":
    asyncio.run(main())
