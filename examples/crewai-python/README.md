# CrewAI Agent with E2B

This example uses CrewAI's native
[`E2BPythonTool`](https://docs.crewai.com/en/tools/ai-ml/e2bsandboxtools)
to let an agent execute Python in an isolated E2B sandbox. The agent generates
a deterministic dataset and returns statistics plus a checksum that were
computed inside the sandbox.

The example uses one persistent tool instance so state is available across
retries. The sandbox is always closed explicitly when the crew finishes or
raises an error.

## Setup and run

### 1. Install dependencies

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) and run:

```bash
uv sync
```

### 2. Configure API keys

Copy the environment template:

```bash
cp .env.template .env
```

Add:

- an [E2B API key](https://e2b.dev/docs/getting-started/api-key);
- an OpenAI API key.

`MODEL` can be changed to another OpenAI model supported by CrewAI.

### 3. Run the crew

```bash
uv run python main.py
```

The final answer is a JSON object with the dataset size, mean, population
standard deviation, p95, and SHA-256 digest. CrewAI's verbose output also shows
the E2B tool call used to compute it.

The deterministic result is:

```json
{
  "count": 10000,
  "mean": 498.0795,
  "population_stddev": 288.902874,
  "p95": 949,
  "sha256": "e7df90c21d14675e7aa60861f67cf9011f49cc1fd58c97bb5622d262fa069662"
}
```

## How sandbox ownership works

`persistent=True` makes this tool instance reuse one sandbox across calls.
The example wraps the crew in `try/finally` and calls `E2BPythonTool.close()`
instead of relying on process-exit cleanup. Keep the timeout as short as the
workload allows.

If you pass an existing `sandbox_id`, the caller owns that sandbox and the tool
will not close it.

## Result and error handling

`E2BPythonTool` returns structured execution data, including `stdout`, `stderr`,
rich results, and an `error` field. The task tells the agent to inspect
`error`, correct failed code, and retry rather than treating a failed execution
as a valid answer.

## Security notes

The sandbox isolates agent-generated code from the host running CrewAI, but
tool inputs and outputs should still be treated as untrusted:

- do not put API keys or other secrets in prompts or sandbox files;
- use persistent mode only when the task needs state across calls;
- explicitly close persistent sandboxes;
- use the smallest practical sandbox and execution timeouts.

See the [E2B sandbox lifecycle documentation](https://e2b.dev/docs/sandbox)
for more details.
