"""Offline check: uv run --project examples/pydantic-ai-temporal-python python tests/test_pydantic_ai_cleanup.py."""

import asyncio
import importlib.util
import io
import sys
import unittest
from contextlib import ExitStack, redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch


class CleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_cleanup_after_setup_failure(self):
        for example in ("pydantic-ai-python", "pydantic-ai-temporal-python"):
            directory = Path(__file__).parents[1] / "examples" / example
            spec = importlib.util.spec_from_file_location(
                "example", directory / "main.py"
            )
            module = importlib.util.module_from_spec(spec)
            sys.modules.pop("project", None)
            with patch.object(sys, "path", [str(directory), *sys.path]):
                spec.loader.exec_module(module)

            for stalled in (None, "destroy", "list"):
                with self.subTest(example=example, stalled=stalled):
                    ref = SimpleNamespace(id="test-owned-sandbox")
                    cancelled = []

                    async def hang(*args, cancelled=cancelled):
                        try:
                            await asyncio.Event().wait()
                        finally:
                            cancelled.append(True)

                    destroy = AsyncMock(
                        side_effect=hang if stalled == "destroy" else None
                    )
                    list_calls = 0

                    async def sandbox_ids(stalled=stalled, hang=hang):
                        nonlocal list_calls
                        list_calls += 1
                        if list_calls > 1 and stalled == "list":
                            await hang()
                        return set()

                    replacements = {
                        "E2BSandboxBackend": Mock(
                            return_value=SimpleNamespace(ref=ref)
                        ),
                        "E2BSandbox": Mock(
                            return_value=SimpleNamespace(destroy=destroy)
                        ),
                        "Workspace": Mock(),
                        "seed": AsyncMock(side_effect=RuntimeError("setup failed")),
                        "sandbox_ids": sandbox_ids,
                        "asyncio": SimpleNamespace(
                            timeout=lambda seconds: asyncio.timeout(
                                0.01 if seconds == 30 else seconds
                            )
                        ),
                    }
                    replacements[
                        "make_agent" if hasattr(module, "make_agent") else "configure"
                    ] = Mock()
                    output = io.StringIO()
                    with ExitStack() as stack:
                        for name, value in replacements.items():
                            stack.enter_context(patch.object(module, name, value))
                        stack.enter_context(redirect_stdout(output))
                        async with asyncio.timeout(1) as watchdog:
                            try:
                                if stalled is None:
                                    with self.assertRaisesRegex(
                                        RuntimeError, "setup failed"
                                    ):
                                        await module.main()
                                else:
                                    with self.assertRaises(TimeoutError):
                                        await module.main()
                            finally:
                                self.assertFalse(
                                    watchdog.expired(), "Cleanup missed its deadline"
                                )

                    destroy.assert_awaited_once_with(ref)
                    self.assertIn(ref.id, output.getvalue())
                    self.assertEqual(
                        "Cleanup verified" in output.getvalue(), stalled is None
                    )
                    self.assertEqual(cancelled, [] if stalled is None else [True])
                    self.assertEqual(list_calls, 1 if stalled == "destroy" else 2)


if __name__ == "__main__":
    unittest.main()
