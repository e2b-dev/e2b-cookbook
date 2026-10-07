from datetime import timedelta

from project import make_agent
from pydantic_ai.durable_exec.temporal import TemporalDurability
from temporalio.common import RetryPolicy

# Registered before the worker starts; stable across both worker processes.
agent = make_agent(
    TemporalDurability(
        activity_config={
            "start_to_close_timeout": timedelta(seconds=45),
            "retry_policy": RetryPolicy(maximum_attempts=2),
        },
    ),
)
