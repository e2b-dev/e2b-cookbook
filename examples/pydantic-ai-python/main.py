"""Diagnose a Python CLI, pause E2B, then fix it in a second agent run."""

import asyncio

from project import (
    DIAGNOSE,
    ENV,
    FIX,
    FIXTURE,
    WORKDIR,
    fingerprints,
    limits,
    make_agent,
    sandbox_ids,
    seed,
    verify,
)
from pydantic_ai.workspaces import Workspace
from pydantic_ai_harness.e2b_sandbox import E2BSandbox, E2BSandboxBackend


async def main() -> None:
    agent = make_agent()
    baseline = await sandbox_ids()
    backend = E2BSandboxBackend(
        working_dir=WORKDIR, env=ENV, sandbox_timeout=600, allow_internet_access=False
    )
    try:
        async with asyncio.timeout(180):
            workspace = Workspace(backend)
            await seed(workspace)
            print(f"Created sandbox: {backend.ref.id}", flush=True)
            first = await agent.run(DIAGNOSE, workspace=backend, usage_limits=limits())
            ref = first.workspace.ref
            assert ref is not None
            assert (
                await workspace.read_bytes("log_stats.py")
                == (FIXTURE / "log_stats.py").read_bytes()
            )
            assert (await workspace.read_text("diagnosis.md")).strip()
            saved = await fingerprints(workspace)
            print(f"Diagnosis saved. Model usage: {first.usage}", flush=True)
            sandbox = await backend.get_sandbox()
            assert await sandbox.pause()
            print(f"Paused sandbox: {ref.id}", flush=True)

            # A fresh attached backend resumes a paused sandbox, without creating one.
            attached = E2BSandbox(
                working_dir=WORKDIR, env=ENV, sandbox_timeout=600
            ).backend(ref)
            continued = Workspace(attached)
            assert await fingerprints(continued) == saved
            second = await agent.run(
                FIX,
                workspace=ref,
                message_history=first.all_messages(),
                usage_limits=limits(),
            )
            assert second.workspace.ref == ref
            assert await sandbox_ids() - baseline == {ref.id}, (
                "Unexpected extra sandbox (run without concurrent sandbox creation)"
            )
            print(
                f"Resumed sandbox: {second.workspace.ref.id}; checksums unchanged before repair",
                flush=True,
            )
            print(second.output)
            print(f"CLI: {await verify(continued)}")
            print(f"Model usage: {second.usage}")
    finally:
        if backend.ref is not None:
            await E2BSandbox().destroy(backend.ref)
            assert backend.ref.id not in await sandbox_ids(), (
                "Cleanup did not remove the sandbox"
            )
            print(f"Cleanup verified: {backend.ref.id}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
