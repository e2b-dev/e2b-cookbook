"""Both invocations register the same workflow, agent, and activity definitions."""

import asyncio
import os
import sys

from pydantic_ai.durable_exec.temporal import PydanticAIPlugin
from temporalio.client import Client
from temporalio.worker import Worker
from workflow import FixLogCLI


async def main() -> None:
    client = await Client.connect(sys.argv[1], plugins=[PydanticAIPlugin()])
    print(f"Worker started: pid={os.getpid()}", flush=True)
    async with Worker(client, task_queue=sys.argv[2], workflows=[FixLogCLI]):
        await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
