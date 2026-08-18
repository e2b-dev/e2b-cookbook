from __future__ import annotations

import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from dataclasses import dataclass
from io import StringIO
from pathlib import Path
from typing import Any

from main import EXAMPLE_RELATIVE_DIRECTORY, run_demo


@dataclass(frozen=True)
class CommandCall:
    argv: list[str]
    cwd: Path
    environment: dict[str, str]
    check: bool


class RecordingCommands:
    def __init__(
        self,
        regression_fixture: Path,
        *,
        fail_on_run: int | None = None,
    ) -> None:
        self.regression_fixture = regression_fixture
        self.fail_on_run = fail_on_run
        self.calls: list[CommandCall] = []
        self.fixture_presence_during_runs: list[bool] = []
        self.run_count = 0

    def __call__(
        self,
        argv: list[str],
        *,
        cwd: Path,
        env: dict[str, str],
        check: bool,
    ) -> subprocess.CompletedProcess[Any]:
        self.calls.append(CommandCall(argv, cwd, dict(env), check))

        if argv[1] == "run":
            self.run_count += 1
            self.fixture_presence_during_runs.append(
                self.regression_fixture.exists()
            )
            if self.fail_on_run == self.run_count:
                raise subprocess.CalledProcessError(1, argv)

        return subprocess.CompletedProcess(argv, 0)


class WarmBoxDemoTests(unittest.TestCase):
    def _prepare_checkout(self, root: Path, lease: str) -> Path:
        example = root / EXAMPLE_RELATIVE_DIRECTORY
        (example / "demo").mkdir(parents=True)
        (example / "fixtures").mkdir()
        (example / ".crabbox.yaml").write_text(
            "provider: e2b\n",
            encoding="utf-8",
        )
        (example / "demo" / "enterprise-regression.json").write_text(
            '{"expected_queue":"priority"}\n',
            encoding="utf-8",
        )
        return example / "fixtures" / f"regression-{lease}.json"

    def test_reuses_one_lease_and_syncs_the_local_regression(self) -> None:
        lease = "warm-tests-unit"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            regression_fixture = self._prepare_checkout(root, lease)
            commands = RecordingCommands(regression_fixture)

            with redirect_stdout(StringIO()):
                run_demo(
                    repo_root=root,
                    environ={"E2B_API_KEY": "e2b_test"},
                    command_runner=commands,
                    crabbox_binary="crabbox",
                    lease=lease,
                )

            self.assertEqual(
                [call.argv[1] for call in commands.calls],
                ["warmup", "run", "run", "stop"],
            )
            self.assertEqual(
                commands.fixture_presence_during_runs,
                [False, True],
            )
            run_leases = [
                call.argv[call.argv.index("--id") + 1]
                for call in commands.calls
                if call.argv[1] == "run"
            ]
            self.assertEqual(run_leases, [lease, lease])
            self.assertFalse(regression_fixture.exists())
            self.assertEqual(
                commands.calls[0].environment["CRABBOX_CONFIG"],
                str(root / EXAMPLE_RELATIVE_DIRECTORY / ".crabbox.yaml"),
            )

    def test_stops_the_lease_and_removes_the_fixture_after_failure(self) -> None:
        lease = "warm-tests-failure"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            regression_fixture = self._prepare_checkout(root, lease)
            commands = RecordingCommands(regression_fixture, fail_on_run=2)

            with redirect_stdout(StringIO()):
                with self.assertRaises(subprocess.CalledProcessError):
                    run_demo(
                        repo_root=root,
                        environ={"E2B_API_KEY": "e2b_test"},
                        command_runner=commands,
                        crabbox_binary="crabbox",
                        lease=lease,
                    )

            self.assertEqual(commands.calls[-1].argv[1], "stop")
            self.assertFalse(commands.calls[-1].check)
            self.assertFalse(regression_fixture.exists())

    def test_requires_an_e2b_api_key(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "Missing E2B_API_KEY"):
            run_demo(
                environ={},
                crabbox_binary="crabbox",
            )
