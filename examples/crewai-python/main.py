from __future__ import annotations

import os

from crewai import Agent, Crew, Process, Task, LLM
from crewai_tools import E2BPythonTool
from dotenv import load_dotenv

DEFAULT_MODEL = "openai/gpt-5.6-luna"
SANDBOX_TIMEOUT_SECONDS = 600

ANALYSIS_TASK = """
Use the E2B Sandbox Python tool to run Python code for this analysis. Do not
estimate or calculate the answer yourself.

1. Create `random.Random(23)`.
2. Generate exactly 10,000 integers with `randint(1, 1000)`, preserving their
   generated order.
3. Calculate:
   - the number of values;
   - the arithmetic mean, rounded to 6 decimal places;
   - the population standard deviation, rounded to 6 decimal places;
   - p95 as item 9,500 in the sorted values (index 9,499);
   - the SHA-256 digest of the generated values joined by commas in their
     original order.

The tool returns a structured result. Inspect its `error` field. If it is not
null, correct the code and run it again.

Return only one JSON object with these keys in this order:
`count`, `mean`, `population_stddev`, `p95`, `sha256`.
"""


def require_environment() -> None:
    missing = [
        name for name in ("E2B_API_KEY", "OPENAI_API_KEY") if not os.getenv(name)
    ]
    if missing:
        names = ", ".join(missing)
        raise RuntimeError(
            f"Missing required environment variables: {names}. "
            "Copy .env.template to .env and add your API keys."
        )


def build_crew(python_tool: E2BPythonTool, model: str) -> Crew:
    analyst = Agent(
        role="Data Analyst",
        goal="Use sandboxed Python to produce accurate, reproducible analysis",
        backstory=(
            "You verify every numerical answer by running code in an isolated "
            "E2B sandbox."
        ),
        tools=[python_tool],
        # gpt-5.6-* are reasoning models: function tools are rejected on
        # /v1/chat/completions unless reasoning effort is off. CrewAI's native
        # OpenAI provider only forwards reasoning_effort when it believes the
        # model is a reasoning model, and it decides that with
        # `"o1" in model.lower()` (crewai/llms/providers/openai/completion.py),
        # so it drops the parameter for anything newer. The Responses API path
        # sends it unconditionally, which is also what the API's own error
        # message recommends, so this example asks for that route.
        llm=LLM(model=model, reasoning_effort="none", api="responses"),
        allow_delegation=False,
        max_iter=8,
        verbose=True,
    )

    task = Task(
        description=ANALYSIS_TASK,
        expected_output=(
            "A JSON object containing count, mean, population_stddev, p95, "
            "and sha256, computed with the E2B Sandbox Python tool."
        ),
        agent=analyst,
    )

    return Crew(
        agents=[analyst],
        tasks=[task],
        process=Process.sequential,
        verbose=True,
    )


def run() -> str:
    load_dotenv()
    require_environment()

    python_tool = E2BPythonTool(
        persistent=True,
        sandbox_timeout=SANDBOX_TIMEOUT_SECONDS,
    )
    try:
        model = os.getenv("MODEL", DEFAULT_MODEL)
        result = build_crew(python_tool, model).kickoff()
        return str(result)
    finally:
        python_tool.close()


def main() -> None:
    result = run()
    print(f"\nFinal answer:\n{result}")


if __name__ == "__main__":
    main()
