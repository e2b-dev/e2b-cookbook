from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from agent import agent
    from project import DIAGNOSE, FIX, fingerprints, limits
    from pydantic_ai.durable_exec.temporal import PydanticAIWorkflow
    from pydantic_ai.workspaces import WorkspaceRef


@workflow.defn
class FixLogCLI(PydanticAIWorkflow):
    __pydantic_ai_agents__ = (agent,)

    def __init__(self):
        self.checkpoint = None
        self.proceed = False

    @workflow.query
    def diagnosis_checkpoint(self) -> dict | None:
        return self.checkpoint

    @workflow.signal
    def continue_fix(self) -> None:
        self.proceed = True

    @workflow.run
    async def run(self, ref: WorkspaceRef) -> dict:
        first = await agent.run(DIAGNOSE, workspace=ref, usage_limits=limits())
        assert first.workspace.ref == ref
        saved = await fingerprints(first.workspace)
        self.checkpoint = {"sandbox_id": ref.id, "checksums": saved}

        # A durable handoff between diagnosis and repair gives the crash a repeatable boundary.
        await workflow.wait_condition(lambda: self.proceed, timeout=180)
        assert await fingerprints(first.workspace) == saved
        second = await agent.run(
            FIX,
            workspace=ref,
            message_history=first.all_messages(),
            usage_limits=limits(),
        )
        assert second.workspace.ref == ref
        return {
            "sandbox_id": ref.id,
            "summary": second.output,
            "model_requests": first.usage.requests + second.usage.requests,
            "input_tokens": first.usage.input_tokens + second.usage.input_tokens,
            "output_tokens": first.usage.output_tokens + second.usage.output_tokens,
            "estimated_cost_usd": str(
                (first.usage.cost or 0) + (second.usage.cost or 0)
            ),
        }
