# Plan-and-execute coding agent with LangGraph and E2B

A hand-wired [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)
graph that repairs a small Python project whose tests fail. Every step — installing
pytest, editing files, re-running the suite — happens inside **one** E2B sandbox,
so the work of step N is still there for step N+1.

```
START → bootstrap → plan → approve → execute ─┐
                      ▲                       │ (more steps)
                      │                       ▼
                      └──(red, < 3 tries)── verify ──(green)── summarize → END
```

- `bootstrap` uploads [`fixture_repo/`](./fixture_repo) (two bugs, four tests),
  installs pytest and records the failing output.
- `plan` asks the model for an ordered list of file changes (structured output).
- `approve` pauses the graph with `interrupt()` until a human answers.
- `execute` runs one plan step with a small tool-calling agent (`read_file`,
  `write_file`, `run_command`) — one node visit per step, same sandbox.
- `verify` re-runs pytest; the graph re-plans on red, at most three times.

The interesting part is not the agent, it is how the sandbox survives the graph.

## What the example shows about sandbox lifecycle

**The `Sandbox` object lives in runtime context, not in graph state.** State is
checkpointed and must be serialisable. The graph is built with
`StateGraph(State, context_schema=RunContext)`; nodes and tools read
`runtime.context.sandbox`. Tools get it injected via `ToolRuntime` — the parameter
never shows up in the schema the model sees.

**Context is not checkpointed, so a resume must rebuild it.** After `interrupt()`
the only thing the checkpoint kept is `sandbox_id` (a string in state). `main()`
deliberately reconnects from it rather than reusing the local variable, because a
real resume often happens in a different process:

```python
sandbox = Sandbox.connect(graph.get_state(config).values["sandbox_id"])
result = graph.invoke(
    Command(resume=approved), config=config, context=RunContext(sandbox, model)
)
```

**A human may take longer than the sandbox timeout.** The default is 300 seconds.
The sandbox is created with `lifecycle={"on_timeout": "pause", "auto_resume": True}`:
on timeout it pauses instead of dying, and the next SDK call wakes it up with its
filesystem and memory intact. See
[Auto-resume](https://e2b.dev/docs/sandbox/auto-resume) and
[Persistence](https://e2b.dev/docs/sandbox/persistence).

**Teardown is explicit.** `sandbox.kill()` runs in `finally`, whether the graph
finished, was rejected, or raised.

## Setup and run

### 1. Install dependencies

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) and run:

```bash
uv sync
```

### 2. Configure API keys

```bash
cp .env.template .env
```

Add an [E2B API key](https://e2b.dev/docs/api-key) and an OpenAI API key. `MODEL`
can be any OpenAI chat model that supports tool calling and structured output.

### 3. Run the agent

```bash
uv run python main.py
```

In a terminal the graph stops and asks whether to apply the plan. Without a TTY
(CI, the cookbook runner) it approves automatically so the resume path still runs.
The process exits `0` only if the fixture's tests pass at the end.

Sample run:

```
Sandbox ixd3yujbyubudwnhnzx97 created

Proposed plan:
  1. shop/cart.py: Fix `subtotal` to sum each line item's price multiplied by its quantity, returning the total (for example, `(10.0, 2)` contributes `20.0`).
  2. shop/discount.py: Fix `apply_discount` to subtract the percentage discount from the original amount by returning `amount * (1 - percent / 100)`, so a zero percent leaves the amount unchanged.
Apply this plan to the repository? [y/N] y
baseline tests: exit 1
plan: 2 step(s)
step 1: Updated `shop/cart.py` so `subtotal` sums each unit price multiplied by its corresponding quantity.
step 2: Updated `shop/discount.py` so `apply_discount` returns `amount * (1 - percent / 100)`, preserving the original amount for a zero-percent discount.
iteration 1: tests exit 0

Tests pass after 1 iteration(s).

Last pytest output:
....                                                                     [100%]
4 passed in 0.01s
```

The whole run — sandbox creation, pytest install, two plan steps and the re-run — takes two to three
minutes at `reasoning={"effort": "high"}`; most of it is model time, not sandbox time.

## Tests

```bash
uv run pytest
```

[`tests/test_graph.py`](./tests/test_graph.py) runs the graph against a fake
sandbox and stubbed LLM calls — no network, no billing. It checks the three things
the example claims: a resume without context fails and a resume with a
reconnected handle succeeds; re-planning stops after three iterations; a rejected
plan changes nothing.

## Security notes

The sandbox isolates model-generated code and shell commands from your machine,
but its inputs and outputs are still untrusted:

- keep API keys out of prompts and sandbox files;
- keep sandbox and command timeouts as short as the workload allows;
- kill sandboxes you own, in `finally`;
- treat the agent's file edits as a proposal to review, not a merged change.

See the [E2B sandbox lifecycle documentation](https://e2b.dev/docs/sandbox).
