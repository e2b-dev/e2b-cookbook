"""Run two test passes on one warm E2B sandbox through Crabbox."""

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Callable, Mapping
from pathlib import Path
from uuid import uuid4

EXAMPLE_RELATIVE_DIRECTORY = Path("examples/crabbox-e2b-python")
FULL_TEST_COMMAND = (
    "cd examples/crabbox-e2b-python && "
    "python3 -m unittest discover -s tests -v"
)
FOCUSED_TEST_COMMAND = (
    "cd examples/crabbox-e2b-python && "
    "python3 -m unittest "
    "tests.test_support_router.SupportRouterTests.test_regression_fixtures -v"
)

CommandRunner = Callable[..., subprocess.CompletedProcess[object]]


def _require_api_key(environment: Mapping[str, str]) -> None:
    if not (
        environment.get("E2B_API_KEY")
        or environment.get("CRABBOX_E2B_API_KEY")
    ):
        raise RuntimeError(
            "Missing E2B_API_KEY. Copy .env.example to .env and load it "
            "into the current shell."
        )


def run_demo(
    *,
    repo_root: Path | None = None,
    environ: Mapping[str, str] | None = None,
    command_runner: CommandRunner = subprocess.run,
    crabbox_binary: str | None = None,
    lease: str | None = None,
) -> None:
    """Warm one sandbox, run twice on it, and always attempt cleanup."""
    root = repo_root or Path(__file__).resolve().parents[2]
    example_directory = root / EXAMPLE_RELATIVE_DIRECTORY
    environment = dict(os.environ if environ is None else environ)
    _require_api_key(environment)

    binary = crabbox_binary or shutil.which("crabbox")
    if not binary:
        raise RuntimeError(
            "Crabbox is not installed. Run `brew install openclaw/tap/crabbox`."
        )

    config_path = example_directory / ".crabbox.yaml"
    source_fixture = example_directory / "demo" / "enterprise-regression.json"
    if not config_path.is_file() or not source_fixture.is_file():
        raise RuntimeError("Run the demo from a complete e2b-cookbook checkout.")

    lease_id = lease or f"warm-tests-{uuid4().hex[:8]}"
    regression_fixture = (
        example_directory / "fixtures" / f"regression-{lease_id}.json"
    )
    if regression_fixture.exists():
        raise RuntimeError(f"Refusing to overwrite {regression_fixture}")

    environment["CRABBOX_CONFIG"] = str(config_path)
    warmup_started = False

    try:
        print(f"\n1/3 Warming E2B sandbox: {lease_id}")
        warmup_started = True
        command_runner(
            [
                binary,
                "warmup",
                "--provider",
                "e2b",
                "--e2b-template",
                "base",
                "--slug",
                lease_id,
            ],
            cwd=root,
            env=environment,
            check=True,
        )

        print("\n2/3 Running the complete suite on the warm sandbox")
        command_runner(
            [
                binary,
                "run",
                "--provider",
                "e2b",
                "--id",
                lease_id,
                "--shell",
                FULL_TEST_COMMAND,
            ],
            cwd=root,
            env=environment,
            check=True,
        )

        shutil.copyfile(source_fixture, regression_fixture)
        print(
            "\nAdded local regression fixture: "
            f"{regression_fixture.relative_to(root)}"
        )
        print("3/3 Resyncing and rerunning the focused test on the same sandbox")
        command_runner(
            [
                binary,
                "run",
                "--provider",
                "e2b",
                "--id",
                lease_id,
                "--shell",
                FOCUSED_TEST_COMMAND,
            ],
            cwd=root,
            env=environment,
            check=True,
        )
    finally:
        regression_fixture.unlink(missing_ok=True)
        if warmup_started:
            print(f"\nStopping E2B sandbox: {lease_id}")
            try:
                result = command_runner(
                    [binary, "stop", "--provider", "e2b", lease_id],
                    cwd=root,
                    env=environment,
                    check=False,
                )
                if result.returncode != 0:
                    print(
                        "Crabbox could not confirm cleanup. Inspect remaining "
                        "leases with `crabbox list --provider e2b`."
                    )
            except OSError as error:
                print(f"Crabbox cleanup could not run: {error}")


def main() -> None:
    try:
        run_demo()
    except RuntimeError as error:
        raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main()
