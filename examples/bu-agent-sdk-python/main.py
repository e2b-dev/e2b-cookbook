"""Data analysis agent with E2B sandbox and bu-agent-sdk."""

import asyncio
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from e2b_code_interpreter import Sandbox

from bu_agent_sdk import Agent
from bu_agent_sdk.agent import FinalResponseEvent, ToolCallEvent, ToolResultEvent
from bu_agent_sdk.llm import ChatAnthropic
from bu_agent_sdk.tools import Depends, tool

load_dotenv()

# Config

INPUT_FILE = Path("data/employees.csv")
OUTPUT_DIR = Path("output")
SYSTEM_PROMPT = "You are a data analyst. Use run_code to execute Python. pandas/numpy/matplotlib are available. Save charts with plt.savefig()."
USER_PROMPT = "Analyze employees.csv: show stats, count by department/city, find highest/lowest paid. Create charts."

# Sandbox Utils

_sandbox: Sandbox | None = None


def get_sandbox() -> Sandbox:
    if _sandbox is None:
        raise RuntimeError("Sandbox not initialized")
    return _sandbox


def download_charts(sandbox: Sandbox):
    for f in sandbox.files.list("/home/user"):
        if f.name.endswith(".png"):
            content = sandbox.files.read(f"/home/user/{f.name}", format="bytes")
            (OUTPUT_DIR / f.name).write_bytes(content)


# Tools


@tool("Run Python code")
async def run_code(code: str, sandbox: Annotated[Sandbox, Depends(get_sandbox)]) -> str:
    """Execute Python code in the sandbox and return output."""
    result = sandbox.run_code(code)

    output = "\n".join(filter(None, [
        "\n".join(result.logs.stdout or []),
        "\n".join(result.logs.stderr or []),
        f"Error: {result.error.name}: {result.error.value}" if result.error else "",
    ]))

    return output or "(no output)"


# Main Agent Loop


async def main():
    global _sandbox

    OUTPUT_DIR.mkdir(exist_ok=True)
    _sandbox = Sandbox.create(timeout=300)
    print(f"Sandbox: {_sandbox.sandbox_id}\n")

    try:
        # Upload input data
        _sandbox.files.write(INPUT_FILE.name, INPUT_FILE.read_text())

        # Create agent
        agent = Agent(
            llm=ChatAnthropic(model="claude-sonnet-4-5"),
            tools=[run_code],
            system_prompt=SYSTEM_PROMPT,
            dependency_overrides={get_sandbox: lambda: _sandbox},
        )

        # Run query
        print(f"Query: {USER_PROMPT}\n")

        async for event in agent.query_stream(USER_PROMPT):
            match event:
                case ToolCallEvent(tool=name, args=args):
                    print(f"[{name}] {str(args)[:100]}...")
                case ToolResultEvent(result=result):
                    print(f"  -> {str(result)[:200]}...")
                case FinalResponseEvent(content=text):
                    print(f"\n{text}")

        # Download results
        download_charts(_sandbox)

    finally:
        _sandbox.kill()


if __name__ == "__main__":
    asyncio.run(main())
