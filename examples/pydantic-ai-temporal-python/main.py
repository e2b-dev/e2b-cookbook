"""Kill and restart a worker while its Temporal server and E2B sandbox stay alive."""

import asyncio
import json
import sys
import uuid
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

from project import (
    ENV,
    FIXTURE,
    WORKDIR,
    configure,
    fingerprints,
    sandbox_ids,
    seed,
    verify,
)
from pydantic_ai.durable_exec.temporal import PydanticAIPlugin
from pydantic_ai.workspaces import Workspace
from pydantic_ai_harness.e2b_sandbox import E2BSandbox, E2BSandboxBackend
from temporalio.client import WorkflowExecutionStatus
from temporalio.exceptions import TemporalError
from temporalio.service import RPCError, RPCStatusCode
from temporalio.testing import WorkflowEnvironment


async def start_worker(address: str, queue: str):
    return await asyncio.create_subprocess_exec(
        sys.executable,
        str(Path(__file__).parent / "worker.py"),
        address,
        queue,
    )


async def stop_worker(worker) -> None:
    if worker is not None and worker.returncode is None:
        worker.kill()  # SIGKILL on macOS/Linux: no Python finally or graceful worker shutdown.
        await asyncio.wait_for(worker.wait(), timeout=10)


async def wait_checkpoint(handle, worker) -> dict:
    async with asyncio.timeout(120):
        while worker.returncode is None:
            try:
                checkpoint = await handle.query(
                    "diagnosis_checkpoint", rpc_timeout=timedelta(seconds=15)
                )
                if checkpoint is not None:
                    return checkpoint
            except RPCError as error:
                if error.status != RPCStatusCode.DEADLINE_EXCEEDED:
                    raise
            except TemporalError:
                if (await handle.describe()).status != WorkflowExecutionStatus.RUNNING:
                    # Propagate a failed workflow instead of polling until timeout.
                    await handle.result()
                    raise RuntimeError("Workflow ended without a diagnosis checkpoint")
            await asyncio.sleep(0.25)
    raise RuntimeError(f"Worker exited before the checkpoint: {worker.returncode}")


async def main() -> None:
    configure()
    baseline = await sandbox_ids()
    backend = E2BSandboxBackend(
        working_dir=WORKDIR, env=ENV, sandbox_timeout=600, allow_internet_access=False
    )
    worker = None
    try:
        async with asyncio.timeout(300):
            workspace = Workspace(backend)
            await seed(workspace)
            ref = backend.ref
            assert ref is not None
            print(f"Created sandbox: {ref.id}", flush=True)
            # The application owns the sandbox; its credential-free ref is durable workflow input.
            with TemporaryDirectory(prefix="pydantic-temporal-") as directory:
                async with await WorkflowEnvironment.start_local(
                    plugins=[PydanticAIPlugin()],
                    dev_server_database_filename=str(Path(directory) / "temporal.db"),
                ) as server:
                    queue = f"log-cli-{uuid.uuid4()}"
                    worker = await start_worker(
                        server.client.service_client.config.target_host, queue
                    )
                    handle = await server.client.start_workflow(
                        "FixLogCLI",
                        ref,
                        id=queue,
                        task_queue=queue,
                    )
                    checkpoint = await wait_checkpoint(handle, worker)
                    assert checkpoint["sandbox_id"] == ref.id
                    assert checkpoint["checksums"] == await fingerprints(workspace)
                    assert (
                        await workspace.read_bytes("log_stats.py")
                        == (FIXTURE / "log_stats.py").read_bytes()
                    )
                    assert (await workspace.read_text("diagnosis.md")).strip()
                    print(
                        f"Durable checkpoint: {ref.id}; diagnosis and files saved",
                        flush=True,
                    )
                    old_pid = worker.pid
                    await stop_worker(worker)
                    print(
                        f"Worker crashed: pid={old_pid}, exit={worker.returncode}",
                        flush=True,
                    )

                    worker = await start_worker(
                        server.client.service_client.config.target_host, queue
                    )
                    assert worker.pid != old_pid
                    recovered = await wait_checkpoint(handle, worker)
                    assert recovered == checkpoint
                    print(
                        f"Checkpoint recovered by pid={worker.pid}; sandbox={ref.id}",
                        flush=True,
                    )
                    await handle.signal("continue_fix")
                    result = await handle.result()
                    assert result["sandbox_id"] == ref.id
                    assert await sandbox_ids() - baseline == {ref.id}, (
                        "Unexpected extra sandbox (run without concurrent sandbox creation)"
                    )
                    print(json.dumps(result, indent=2), flush=True)
                    print(f"CLI: {await verify(workspace)}", flush=True)
                    print(
                        "Exactly one sandbox; original workflow completed after worker restart",
                        flush=True,
                    )
                    await stop_worker(worker)
                    worker = None
    finally:
        try:
            await stop_worker(worker)
        finally:
            # A failed local shutdown must not skip remote cleanup.
            if backend.ref is not None:
                await E2BSandbox().destroy(backend.ref)
                assert backend.ref.id not in await sandbox_ids(), (
                    "Cleanup did not remove the sandbox"
                )
                print(f"Cleanup verified: {backend.ref.id}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
