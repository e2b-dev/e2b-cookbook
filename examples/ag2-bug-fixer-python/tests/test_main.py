"""Offline tests: LocalEnvironment stands in for E2B and TestConfig scripts the model."""

import json
import os
import sys
from pathlib import Path

import pytest
from ag2.events import ToolCallEvent
from ag2.testing import TestConfig
from ag2.tools import LocalEnvironment

import main

FIX = "sed -i.bak 's/ordered\\[middle\\] + ordered\\[middle + 1\\]/ordered[middle - 1] + ordered[middle]/' stats/summary.py"


@pytest.fixture
def local_env(tmp_path: Path) -> LocalEnvironment:
    # `python` may be missing on the host PATH (macOS ships only python3).
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "python").symlink_to(sys.executable)
    workdir = tmp_path / "repo"
    workdir.mkdir()
    return LocalEnvironment(
        workdir,
        env_vars={
            **main.ENV_VARS,
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        },
    )


def shell(command: str) -> ToolCallEvent:
    return ToolCallEvent(
        name="run_shell_command", arguments=json.dumps({"command": command})
    )


def test_require_environment_lists_missing_variables(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("E2B_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(RuntimeError, match="E2B_API_KEY, OPENAI_API_KEY"):
        main.require_environment()


async def test_fixture_fails_before_the_fix(local_env: LocalEnvironment) -> None:
    await main.upload_repository(local_env)

    result = await main.run_tests(local_env)

    assert result.exit_code != 0
    assert "test_even_length" in result.output


async def test_agent_fix_is_verified_independently(local_env: LocalEnvironment) -> None:
    config = TestConfig(
        shell("python -m unittest"),
        shell(FIX),
        shell("python -m unittest"),
        "Fixed the even-length median.",
    )

    summary, result = await main.fix_bug(local_env, config)

    assert summary == "Fixed the even-length median."
    assert result.exit_code == 0, result.output
    assert "OK" in result.output


async def test_agent_that_replaces_the_tests_still_fails(
    local_env: LocalEnvironment,
) -> None:
    fake_tests = "printf 'import unittest\\nclass T(unittest.TestCase):\\n    def test_ok(self): pass\\n' > tests/test_summary.py"
    config = TestConfig(shell(fake_tests), shell("python -m unittest"), "All green.")

    _, result = await main.fix_bug(local_env, config)

    assert result.exit_code != 0
    assert "test_even_length" in result.output


async def test_agent_that_gives_up_leaves_tests_failing(
    local_env: LocalEnvironment,
) -> None:
    summary, result = await main.fix_bug(local_env, TestConfig("I could not fix it."))

    assert summary == "I could not fix it."
    assert result.exit_code != 0


async def test_upload_skips_bytecode_caches(
    local_env: LocalEnvironment, tmp_path: Path
) -> None:
    source = tmp_path / "source"
    (source / "pkg" / "__pycache__").mkdir(parents=True)
    (source / "pkg" / "mod.py").write_text("x = 1\n")
    (source / "pkg" / "__pycache__" / "mod.cpython-312.pyc").write_bytes(b"\0")

    await main.upload_repository(local_env, source)

    assert (tmp_path / "repo" / "pkg" / "mod.py").read_text() == "x = 1\n"
    assert not (tmp_path / "repo" / "pkg" / "__pycache__").exists()
