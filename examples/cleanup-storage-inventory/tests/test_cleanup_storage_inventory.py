import contextlib
import csv
import io
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from e2b import (
    AuthenticationException,
    RateLimitException,
    SandboxException,
    SandboxNotFoundException,
    SandboxState,
)

import cleanup_storage_inventory as cleanup

HEADER = "as_of_date,resource_type,resource_id,size_gib,last_used_at\n"
PAUSED_AT = datetime.now(UTC) - timedelta(days=100)
PAUSED = (SandboxState.PAUSED, PAUSED_AT - timedelta(hours=1))
RUNNING = (SandboxState.RUNNING, PAUSED_AT - timedelta(hours=1))


def row(kind: str, resource_id: str, last_used_at: datetime = PAUSED_AT) -> str:
    return f"2026-09-23,{kind},{resource_id},1.500000,{last_used_at.strftime('%Y-%m-%dT%H:%M:%S.%fZ')}\n"


class FakeClient:
    """Stands in for the Sandbox class. sandboxes maps id -> (state, started_at);
    snapshots maps id -> True (deletable) or an exception to raise."""

    def __init__(self, sandboxes=None, snapshots=None):
        self.sandboxes = dict(sandboxes or {})
        self.snapshots = dict(snapshots or {})
        self.calls = []

    def get_info(self, sandbox_id):
        self.calls.append(("get_info", sandbox_id))
        if sandbox_id not in self.sandboxes:
            raise SandboxNotFoundException(sandbox_id)
        state, started_at = self.sandboxes[sandbox_id]
        return SimpleNamespace(state=state, started_at=started_at)

    def kill(self, sandbox_id):
        self.calls.append(("kill", sandbox_id))
        return self.sandboxes.pop(sandbox_id, None) is not None

    def delete_snapshot(self, snapshot_id):
        self.calls.append(("delete_snapshot", snapshot_id))
        if isinstance(self.snapshots.get(snapshot_id), Exception):
            raise self.snapshots[snapshot_id]
        return self.snapshots.pop(snapshot_id, None) is not None


class CleanupTests(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.inventory = Path(directory.name) / "inventory.csv"
        self.results = Path(directory.name) / "inventory.results.csv"

    def write(self, *rows: str, header: str = HEADER) -> None:
        self.inventory.write_text(header + "".join(rows))

    def run_main(self, *args: str, client: FakeClient) -> tuple[int, str]:
        output = io.StringIO()
        with (
            contextlib.redirect_stdout(output),
            contextlib.redirect_stderr(output),
            mock.patch.dict("os.environ", {"E2B_API_KEY": "e2b_test"}),
        ):
            try:
                with mock.patch.object(cleanup, "Sandbox", client):
                    code = cleanup.main([str(self.inventory), *args])
            except SystemExit as exit:
                code = exit.code
        if isinstance(code, str):
            return 1, output.getvalue() + code
        return code, output.getvalue()

    def outcomes(self) -> dict[str, str]:
        with self.results.open(newline="") as file:
            return {r["resource_id"]: r["outcome"] for r in csv.DictReader(file)}

    def test_rejects_a_different_header(self) -> None:
        self.write(row("snapshot", "a"), header="resource_type,resource_id\n")

        code, output = self.run_main(client=FakeClient())

        self.assertEqual(code, 1)
        self.assertIn("must be as_of_date,resource_type", output)

    def test_rejects_an_invalid_row_before_calling_the_api(self) -> None:
        client = FakeClient()
        self.write(row("snapshot", "ok"), row("template", "base"))

        code, output = self.run_main("--apply", client=client)

        self.assertEqual(code, 1)
        self.assertIn("line 3: unknown resource_type 'template'", output)
        self.assertEqual(client.calls, [])

    def test_dry_run_calls_nothing(self) -> None:
        client = FakeClient()
        self.write(
            row("paused_sandbox", "s1"),
            row("snapshot", "t1"),
        )

        code, output = self.run_main(client=client)

        self.assertEqual(code, 0)
        self.assertRegex(output, r"paused_sandbox\s+1 rows\s+1.50 GiB")
        self.assertEqual(client.calls, [])
        self.assertFalse(self.results.exists())

    def test_filters_by_type_and_age(self) -> None:
        recent = datetime.now(UTC) - timedelta(days=10)
        client = FakeClient(
            sandboxes={"old": PAUSED, "new": PAUSED}, snapshots={"t1": True}
        )
        self.write(
            row("paused_sandbox", "old"),
            row("paused_sandbox", "new", recent),
            row("snapshot", "t1"),
        )

        code, _ = self.run_main(
            "--type",
            "paused_sandbox",
            "--older-than-days",
            "90",
            "--apply",
            client=client,
        )

        self.assertEqual(code, 0)
        self.assertEqual(self.outcomes(), {"old": "deleted"})

    def test_maps_each_case_to_an_outcome_and_kills_before_deleting_snapshots(
        self,
    ) -> None:
        client = FakeClient(
            sandboxes={
                "paused": PAUSED,
                "running": RUNNING,
                "resumed-since": (SandboxState.PAUSED, PAUSED_AT + timedelta(days=1)),
            },
            snapshots={
                "unused": True,
                "in-use": SandboxException("400: in use", status_code=400),
            },
        )
        self.write(
            row("snapshot", "unused"),
            row("snapshot", "in-use"),
            row("snapshot", "gone-snapshot"),
            row("paused_sandbox", "paused"),
            row("paused_sandbox", "running"),
            row("paused_sandbox", "resumed-since"),
            row("paused_sandbox", "gone-sandbox"),
        )

        code, _ = self.run_main("--apply", "--workers", "4", client=client)

        self.assertEqual(code, 1)
        self.assertEqual(
            self.outcomes(),
            {
                "unused": "deleted",
                "in-use": "skipped_in_use",
                "gone-snapshot": "not_found",
                "paused": "deleted",
                "running": "skipped_running",
                "resumed-since": "skipped_changed",
                "gone-sandbox": "not_found",
            },
        )
        kinds = [call[0] == "delete_snapshot" for call in client.calls]
        self.assertEqual(kinds, sorted(kinds))

    def test_rerun_skips_deleted_rows_and_retries_the_rest(self) -> None:
        client = FakeClient(sandboxes={"done": PAUSED, "busy": RUNNING})
        self.write(
            row("paused_sandbox", "done"),
            row("paused_sandbox", "busy"),
            row("paused_sandbox", "gone"),
        )
        self.run_main("--apply", "--workers", "1", client=client)
        client.sandboxes["busy"] = PAUSED
        client.calls.clear()

        code, _ = self.run_main("--apply", "--workers", "1", client=client)

        self.assertEqual(code, 0)
        # not_found is re-checked: another team's sandbox also answers 404.
        self.assertEqual(
            client.calls, [("get_info", "busy"), ("kill", "busy"), ("get_info", "gone")]
        )
        self.assertEqual(
            self.outcomes(), {"done": "deleted", "busy": "deleted", "gone": "not_found"}
        )

    def test_apply_without_an_api_key_stops_before_any_call(self) -> None:
        client = FakeClient(snapshots={"t1": True})
        self.write(row("snapshot", "t1"))

        with mock.patch.dict("os.environ", clear=True):
            output = io.StringIO()
            with (
                contextlib.redirect_stdout(output),
                self.assertRaises(SystemExit) as exit,
                mock.patch.object(cleanup, "Sandbox", client),
            ):
                cleanup.main([str(self.inventory), "--apply"])

        self.assertIn("set E2B_API_KEY", str(exit.exception.code))
        self.assertEqual(client.calls, [])

    def test_api_errors_fail_the_row_and_the_run_continues(self) -> None:
        client = FakeClient(
            snapshots={
                "limited": RateLimitException("429: Rate limit exceeded"),
                "broken": SandboxException("500: boom", status_code=500),
                "fine": True,
            }
        )
        self.write(
            row("snapshot", "limited"),
            row("snapshot", "broken"),
            row("snapshot", "fine"),
        )

        code, output = self.run_main("--apply", "--workers", "1", client=client)

        self.assertEqual(code, 1)
        self.assertEqual(
            self.outcomes(),
            {"limited": "rate_limited", "broken": "failed", "fine": "deleted"},
        )
        self.assertIn("rate_limited 1", output)
        self.assertIn("Re-run with fewer --workers (currently 1)", output)

    def test_forbidden_stops_the_run(self) -> None:
        forbidden = SandboxException("403: not your template", status_code=403)
        client = FakeClient(snapshots={"t1": forbidden, "t2": True})
        self.write(row("snapshot", "t1"), row("snapshot", "t2"))

        code, output = self.run_main("--apply", "--workers", "1", client=client)

        self.assertEqual(code, 1)
        self.assertIn("another team", output)
        # Rows queued behind the 403 are cancelled, not recorded.
        self.assertEqual(self.outcomes(), {})

    def test_unauthorized_stops_the_run(self) -> None:
        client = FakeClient(
            snapshots={"t1": AuthenticationException("401: invalid key"), "t2": True}
        )
        self.write(row("snapshot", "t1"), row("snapshot", "t2"))

        code, output = self.run_main("--apply", "--workers", "1", client=client)

        self.assertEqual(code, 1)
        self.assertIn("401: invalid key", output)
        self.assertEqual(self.outcomes(), {})


if __name__ == "__main__":
    unittest.main()
