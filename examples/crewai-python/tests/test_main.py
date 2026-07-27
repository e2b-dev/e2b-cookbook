from __future__ import annotations

from unittest.mock import Mock

import pytest

import main


class FakeResult:
    def __str__(self) -> str:
        return "result"


def set_required_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("E2B_API_KEY", "e2b_test")
    monkeypatch.setenv("OPENAI_API_KEY", "openai_test")


def test_require_environment_lists_missing_variables(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("E2B_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(
        RuntimeError,
        match="E2B_API_KEY, OPENAI_API_KEY",
    ):
        main.require_environment()


def test_run_closes_persistent_tool_after_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_required_environment(monkeypatch)
    tool = Mock()
    tool_factory = Mock(return_value=tool)
    crew = Mock()
    crew.kickoff.return_value = FakeResult()
    build_crew = Mock(return_value=crew)

    monkeypatch.setattr(main, "load_dotenv", Mock())
    monkeypatch.setattr(main, "E2BPythonTool", tool_factory)
    monkeypatch.setattr(main, "build_crew", build_crew)

    assert main.run() == "result"
    tool_factory.assert_called_once_with(
        persistent=True,
        sandbox_timeout=main.SANDBOX_TIMEOUT_SECONDS,
    )
    build_crew.assert_called_once_with(tool, main.DEFAULT_MODEL)
    tool.close.assert_called_once_with()


def test_run_closes_persistent_tool_after_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_required_environment(monkeypatch)
    tool = Mock()
    crew = Mock()
    crew.kickoff.side_effect = RuntimeError("crew failed")

    monkeypatch.setattr(main, "load_dotenv", Mock())
    monkeypatch.setattr(main, "E2BPythonTool", Mock(return_value=tool))
    monkeypatch.setattr(main, "build_crew", Mock(return_value=crew))

    with pytest.raises(RuntimeError, match="crew failed"):
        main.run()

    tool.close.assert_called_once_with()


def test_single_agent_crew_keeps_supplied_tool_instance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_required_environment(monkeypatch)
    tool = main.E2BPythonTool(persistent=True)

    crew = main.build_crew(tool, main.DEFAULT_MODEL)

    assert len(crew.agents) == 1
    assert crew.agents[0].tools[0] is tool
    tool.close()


def test_sequential_agents_keep_shared_tool_instance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_required_environment(monkeypatch)
    tool = main.E2BPythonTool(persistent=True)
    first_agent = main.Agent(
        role="Data Producer",
        goal="Produce data with sandboxed Python",
        backstory="A producer that always executes Python.",
        tools=[tool],
        llm=main.DEFAULT_MODEL,
    )
    second_agent = main.Agent(
        role="Data Reviewer",
        goal="Review data with sandboxed Python",
        backstory="A reviewer that verifies work by executing Python.",
        tools=[tool],
        llm=main.DEFAULT_MODEL,
    )
    first_task = main.Task(
        description="Create a value with Python.",
        expected_output="A computed value.",
        agent=first_agent,
    )
    second_task = main.Task(
        description="Verify the computed value with Python.",
        expected_output="A verification result.",
        agent=second_agent,
        context=[first_task],
    )

    crew = main.Crew(
        agents=[first_agent, second_agent],
        tasks=[first_task, second_task],
        process=main.Process.sequential,
    )

    assert crew.agents[0].tools[0] is tool
    assert crew.agents[1].tools[0] is tool
    tool.close()
