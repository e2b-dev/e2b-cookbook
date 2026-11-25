"""Unit tests for the OpenAdapt + E2B cookbook example."""

from __future__ import annotations

import unittest
from dataclasses import dataclass

from e2b import CommandExitException

import main


@dataclass
class FakeResult:
    exit_code: int = 0
    stdout: str = "VERIFIED"
    stderr: str = ""


class FakeCommands:
    def __init__(self, *, fail_on_second: bool = False) -> None:
        self.calls: list[str] = []
        self.fail_on_second = fail_on_second

    def run(self, cmd: str, timeout: int = 60) -> FakeResult:
        self.calls.append(cmd)
        if self.fail_on_second and len(self.calls) == 2:
            raise CommandExitException(
                stdout="",
                stderr="simulated failure",
                exit_code=1,
                error="command failed",
            )
        return FakeResult()


class FakeSandbox:
    def __init__(self, *, fail_on_second: bool = False) -> None:
        self.commands = FakeCommands(fail_on_second=fail_on_second)
        self.killed = False

    def kill(self) -> None:
        self.killed = True


class OpenAdaptE2BTests(unittest.TestCase):
    def test_requires_e2b_api_key(self) -> None:
        with self.assertRaises(RuntimeError):
            main.resolve_settings({})

    def test_defaults_to_quickstart_without_anthropic_key(self) -> None:
        mode, envs = main.resolve_settings({"E2B_API_KEY": "test-key"})
        self.assertEqual(mode, "quickstart")
        self.assertEqual(envs, {})

    def test_uses_wrap_example_with_anthropic_key(self) -> None:
        mode, envs = main.resolve_settings(
            {"E2B_API_KEY": "test-key", "ANTHROPIC_API_KEY": "sk-ant-test"}
        )
        self.assertEqual(mode, "wrap-example")
        self.assertEqual(envs, {"ANTHROPIC_API_KEY": "sk-ant-test"})

    def test_builds_expected_commands(self) -> None:
        quickstart_cmd = main.build_openadapt_command(
            "quickstart", "/home/user/openadapt-quickstart"
        )
        self.assertIn("openadapt quickstart --out /home/user/openadapt-quickstart", quickstart_cmd)

        wrap_cmd = main.build_openadapt_command(
            "wrap-example", "/home/user/openadapt-wrap"
        )
        self.assertIn("openadapt wrap --example --json --out /home/user/openadapt-wrap", wrap_cmd)

    def test_cleans_up_sandbox_on_success(self) -> None:
        sandbox = FakeSandbox()
        output = main.run_demo(
            environment={"E2B_API_KEY": "test-key"},
            sandbox_factory=lambda **_: sandbox,
        )
        self.assertEqual(output, "VERIFIED")
        self.assertEqual(len(sandbox.commands.calls), 2)
        self.assertTrue(sandbox.killed)

    def test_cleans_up_sandbox_on_command_failure(self) -> None:
        sandbox = FakeSandbox(fail_on_second=True)
        with self.assertRaises(RuntimeError):
            main.run_demo(
                environment={"E2B_API_KEY": "test-key"},
                sandbox_factory=lambda **_: sandbox,
            )
        self.assertTrue(sandbox.killed)


if __name__ == "__main__":
    unittest.main()
