from __future__ import annotations

import tempfile
import unittest
from contextlib import redirect_stdout
from dataclasses import dataclass
from io import StringIO
from pathlib import Path

from main import SKILL_NAME, run_demo


@dataclass
class RecordedResult:
    exit_code: int = 0
    stdout: str = "ok\n"
    stderr: str = ""


class RecordingCommands:
    def __init__(self, *, fail_first_agent: bool = False) -> None:
        self.commands: list[str] = []
        self.fail_first_agent = fail_first_agent
        self.agent_runs = 0

    def run(self, command: str, **_: object) -> RecordedResult:
        self.commands.append(command)
        if command.startswith("hermes chat"):
            self.agent_runs += 1
            if self.fail_first_agent and self.agent_runs == 1:
                return RecordedResult(1, "", "provider failed")
        if command.startswith("find "):
            return RecordedResult(
                stdout=f"/home/user/.hermes/skills/{SKILL_NAME}/SKILL.md\n"
            )
        return RecordedResult()


class RecordingFiles:
    def __init__(self) -> None:
        self.writes: dict[str, str] = {}

    def write(self, path: str, content: str) -> None:
        self.writes[path] = content


class RecordingSandbox:
    def __init__(self, *, fail_first_agent: bool = False) -> None:
        self.commands = RecordingCommands(fail_first_agent=fail_first_agent)
        self.files = RecordingFiles()
        self.killed = False

    def kill(self) -> None:
        self.killed = True


class RecordingFactory:
    def __init__(self, sandbox: RecordingSandbox) -> None:
        self.sandbox = sandbox
        self.calls: list[tuple[str, dict[str, object]]] = []

    def __call__(self, template: str, **options: object) -> RecordingSandbox:
        self.calls.append((template, options))
        return self.sandbox


class HermesIncidentPlaybookTests(unittest.TestCase):
    def _example(self, root: Path) -> Path:
        example = root / "example"
        (example / "incidents").mkdir(parents=True)
        (example / "runbook.md").write_text("triage steps\n", encoding="utf-8")
        (example / "incidents" / "checkout-latency.json").write_text(
            '{"incident_id":"INC-1"}\n', encoding="utf-8"
        )
        (example / "incidents" / "checkout-errors.json").write_text(
            '{"incident_id":"INC-2"}\n', encoding="utf-8"
        )
        return example

    def test_learns_and_reuses_the_incident_skill(self) -> None:
        sandbox = RecordingSandbox()
        factory = RecordingFactory(sandbox)
        environment = {
            "E2B_API_KEY": "e2b_test",
            "OPENROUTER_API_KEY": "or_test",
            "HERMES_PROVIDER": "openrouter",
            "HERMES_MODEL": "test/model",
            "HERMES_TEMPLATE": "hermes:smoke",
        }

        with tempfile.TemporaryDirectory() as directory:
            with redirect_stdout(StringIO()):
                run_demo(
                    environ=environment,
                    sandbox_factory=factory,
                    example_directory=self._example(Path(directory)),
                )

        self.assertEqual(factory.calls[0][0], "hermes:smoke")
        self.assertEqual(
            factory.calls[0][1]["envs"],
            {"OPENROUTER_API_KEY": "or_test"},
        )
        agent_commands = [
            command
            for command in sandbox.commands.commands
            if command.startswith("hermes chat")
        ]
        self.assertEqual(len(agent_commands), 2)
        self.assertIn("--yolo", agent_commands[0])
        self.assertIn("--model test/model", agent_commands[0])
        self.assertNotIn("--skills", agent_commands[0])
        self.assertIn(f"--skills {SKILL_NAME}", agent_commands[1])
        self.assertEqual(len(sandbox.files.writes), 3)
        self.assertTrue(sandbox.killed)

    def test_kills_the_sandbox_when_hermes_fails(self) -> None:
        sandbox = RecordingSandbox(fail_first_agent=True)
        factory = RecordingFactory(sandbox)

        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "provider failed"):
                with redirect_stdout(StringIO()):
                    run_demo(
                        environ={
                            "E2B_API_KEY": "e2b_test",
                            "OPENROUTER_API_KEY": "or_test",
                        },
                        sandbox_factory=factory,
                        example_directory=self._example(Path(directory)),
                    )

        self.assertTrue(sandbox.killed)

    def test_requires_e2b_and_provider_credentials(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "Missing E2B_API_KEY"):
            run_demo(environ={}, sandbox_factory=RecordingFactory(RecordingSandbox()))

        with self.assertRaisesRegex(RuntimeError, "Missing OPENROUTER_API_KEY"):
            run_demo(
                environ={"E2B_API_KEY": "e2b_test"},
                sandbox_factory=RecordingFactory(RecordingSandbox()),
            )
