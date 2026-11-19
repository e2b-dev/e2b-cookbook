"""Plan-and-execute coding agent: a LangGraph graph that fixes a failing test suite,
running every step inside one E2B sandbox.

What the graph demonstrates about sandbox lifecycle:

* the live ``Sandbox`` object travels in runtime context, never in graph state —
  state is checkpointed, context is not;
* the serialisable ``sandbox_id`` lives in state, so a resume can rebuild the
  context with ``Sandbox.connect``;
* the sandbox pauses instead of dying while a human decides, and wakes on the
  next SDK call (``lifecycle={"on_timeout": "pause", "auto_resume": True}``).
"""

from __future__ import annotations

import os
import sys
from operator import add
from pathlib import Path
from typing import Annotated, TypedDict

from dotenv import load_dotenv
from e2b import Sandbox
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from langgraph.types import Command, interrupt
from pydantic import BaseModel, Field

from sandbox_tools import (
    REPO_DIR,
    RunContext,
    read_file,
    run_command,
    run_tests,
    write_file,
)

DEFAULT_MODEL = "gpt-5.6-luna"
SANDBOX_TIMEOUT_SECONDS = 600
MAX_ITERATIONS = 3
FIXTURE_DIR = Path(__file__).parent / "fixture_repo"

PLANNER_PROMPT = """You are planning how to fix a Python project whose tests fail.
Given the pytest output, write an ordered list of concrete steps. Each step names
one file to change and what to change in it. Do not include steps for running
tests — the graph runs them after every plan."""

EXECUTOR_PROMPT = f"""You are a careful engineer working in a repository at {REPO_DIR}.
Carry out exactly the step you are given: read the file first, then write the
whole corrected file back. Do not touch other files. Do not run the test suite;
reply with one sentence describing the change."""


class Plan(BaseModel):
    steps: list[str] = Field(
        description="Ordered steps; each names a file and the change"
    )


class State(TypedDict, total=False):
    # Serialisable handle: survives checkpoints. The Sandbox object does not.
    sandbox_id: str
    files: list[str]
    test_output: str
    tests_passed: bool
    plan: list[str]
    step_index: int
    approved: bool
    iterations: int
    log: Annotated[list[str], add]
    summary: str


# --- LLM calls, kept as plain functions so tests can swap them ----------------


def make_plan(model, files: list[str], test_output: str) -> list[str]:
    prompt = (
        f"Repository files:\n{chr(10).join(files)}\n\npytest output:\n{test_output}"
    )
    plan = model.with_structured_output(Plan).invoke(
        [("system", PLANNER_PROMPT), ("human", prompt)]
    )
    return plan.steps


def run_step(context: RunContext, files: list[str], step: str) -> str:
    agent = create_agent(
        context.model,
        tools=[read_file, write_file, run_command],
        system_prompt=EXECUTOR_PROMPT,
        context_schema=RunContext,
    )
    task = f"{step}\n\nRepository files:\n{chr(10).join(files)}"
    result = agent.invoke({"messages": [("human", task)]}, context=context)
    return result["messages"][-1].text


# --- Nodes --------------------------------------------------------------------


def bootstrap(state: State, runtime: Runtime[RunContext]) -> State:
    sandbox = runtime.context.sandbox
    files = sorted(str(p.relative_to(FIXTURE_DIR)) for p in FIXTURE_DIR.rglob("*.py"))
    for name in files:
        sandbox.files.write(f"{REPO_DIR}/{name}", (FIXTURE_DIR / name).read_text())
    sandbox.commands.run("pip install --quiet pytest", timeout=120)
    exit_code, output = run_tests(sandbox)
    return {
        "sandbox_id": sandbox.sandbox_id,
        "files": files,
        "tests_passed": exit_code == 0,
        "test_output": output,
        "iterations": 0,
        "log": [f"baseline tests: exit {exit_code}"],
    }


def plan(state: State, runtime: Runtime[RunContext]) -> State:
    steps = make_plan(runtime.context.model, state["files"], state["test_output"])
    return {"plan": steps, "step_index": 0, "log": [f"plan: {len(steps)} step(s)"]}


def approve(state: State) -> State:
    decision = interrupt(
        {"plan": state["plan"], "question": "Apply this plan to the repository?"}
    )
    return {"approved": bool(decision)}


def execute(state: State, runtime: Runtime[RunContext]) -> State:
    index = state["step_index"]
    report = run_step(runtime.context, state["files"], state["plan"][index])
    return {"step_index": index + 1, "log": [f"step {index + 1}: {report}"]}


def verify(state: State, runtime: Runtime[RunContext]) -> State:
    exit_code, output = run_tests(runtime.context.sandbox)
    iteration = state["iterations"] + 1
    return {
        "tests_passed": exit_code == 0,
        "test_output": output,
        "iterations": iteration,
        "log": [f"iteration {iteration}: tests exit {exit_code}"],
    }


def summarize(state: State) -> State:
    if not state.get("approved", False):
        status = "Plan rejected; nothing was changed."
    elif state["tests_passed"]:
        status = f"Tests pass after {state['iterations']} iteration(s)."
    else:
        status = f"Tests are still failing after {MAX_ITERATIONS} iterations."
    return {"summary": f"{status}\n\nLast pytest output:\n{state['test_output']}"}


def after_approve(state: State) -> str:
    return "execute" if state["approved"] else "summarize"


def after_execute(state: State) -> str:
    return "execute" if state["step_index"] < len(state["plan"]) else "verify"


def after_verify(state: State) -> str:
    if state["tests_passed"] or state["iterations"] >= MAX_ITERATIONS:
        return "summarize"
    return "plan"


def build_graph():
    graph = StateGraph(State, context_schema=RunContext)
    for node in (bootstrap, plan, approve, execute, verify, summarize):
        graph.add_node(node)
    graph.add_edge(START, "bootstrap")
    graph.add_edge("bootstrap", "plan")
    graph.add_edge("plan", "approve")
    graph.add_conditional_edges("approve", after_approve, ["execute", "summarize"])
    graph.add_conditional_edges("execute", after_execute, ["execute", "verify"])
    graph.add_conditional_edges("verify", after_verify, ["plan", "summarize"])
    graph.add_edge("summarize", END)
    # ponytail: InMemorySaver keeps the checkpoint in this process. Swap in a
    # persistent checkpointer and the resume below can run from another process.
    return graph.compile(checkpointer=InMemorySaver())


# --- Entrypoint ---------------------------------------------------------------


def require_environment() -> None:
    missing = [
        name for name in ("E2B_API_KEY", "OPENAI_API_KEY") if not os.getenv(name)
    ]
    if missing:
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}. "
            "Copy .env.template to .env and add your API keys."
        )


def ask_human(request: dict) -> bool:
    print("\nProposed plan:")
    for number, step in enumerate(request["plan"], 1):
        print(f"  {number}. {step}")
    if not sys.stdin.isatty():
        # ponytail: CI and the cookbook runner have no human. Approve so the run
        # still exercises the interrupt → resume → reconnect path.
        print("No TTY: approving automatically.")
        return True
    return input(f"{request['question']} [y/N] ").strip().lower() == "y"


def main() -> int:
    load_dotenv()
    require_environment()
    # Reasoning model with tools: use the Responses API, as OpenAI recommends.
    model = ChatOpenAI(
        model=os.getenv("MODEL", DEFAULT_MODEL),
        use_responses_api=True,
        reasoning={"effort": "high"},
    )
    graph = build_graph()
    config = {"configurable": {"thread_id": "fix-failing-tests"}}

    # Default timeout is 300 s and a human may take longer to answer the interrupt.
    # Pause on timeout instead of dying; the next SDK call wakes the sandbox up.
    sandbox = Sandbox.create(
        timeout=SANDBOX_TIMEOUT_SECONDS,
        lifecycle={"on_timeout": "pause", "auto_resume": True},
    )
    print(f"Sandbox {sandbox.sandbox_id} created")
    try:
        result = graph.invoke({}, config=config, context=RunContext(sandbox, model))
        while "__interrupt__" in result:
            approved = ask_human(result["__interrupt__"][0].value)
            # A resume may run in a different process from the original invoke, so
            # the Sandbox object is gone. Rebuild it from the id the checkpoint kept.
            sandbox = Sandbox.connect(graph.get_state(config).values["sandbox_id"])
            result = graph.invoke(
                Command(resume=approved),
                config=config,
                context=RunContext(sandbox, model),
            )
    finally:
        sandbox.kill()

    print("\n".join(result["log"]))
    print(f"\n{result['summary']}")
    return 0 if result.get("tests_passed") else 1


if __name__ == "__main__":
    sys.exit(main())
