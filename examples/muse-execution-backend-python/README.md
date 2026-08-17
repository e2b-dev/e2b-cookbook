# Meta Muse Sandboxed Execution with E2B (Python)

This example adapts Meta's [sandboxed execution cookbook](https://dev.meta.ai/docs/cookbook/sandboxed-execution): the Muse Spark agent loop stays in the caller process, while E2B replaces Docker as the disposable execution environment.

The model receives two tools backed by one E2B sandbox:

- `run` runs a command from the repository workspace.
- `write_file` writes a file below that workspace.

The Meta API key stays in the caller process. The sandbox is terminated in a `finally` block after the run.

## How to run example

**1. Set API keys**

Copy the example environment file and set `E2B_API_KEY` and `META_API_KEY`. You need access to the [E2B dashboard](https://e2b.dev/docs) and Meta Model API with Muse Spark.

```bash
cd examples/muse-execution-backend-python
cp .env.example .env
```

```dotenv
E2B_API_KEY=...
META_API_KEY=...
```

`META_BASE_URL` defaults to `https://api.meta.ai/v1`, and `META_MODEL` defaults to `muse-spark-1.2`.

**2. Install dependencies**

```bash
uv sync --all-groups
```

**3. Run the agent**

The example clones a public HTTPS repository into a fresh sandbox and keeps it alive for the complete agent run.

```bash
uv run python -m muse_execution_backend.main \
  --repo-url https://github.com/your-org/your-repository.git \
  --task "Locate the failing test, fix the implementation, and run the targeted tests." \
  --max-steps 20
```

Use `--repo-ref` for a branch, tag, or commit, and `--template` when the repository needs an E2B template with preinstalled system dependencies.

## Notes

- The model can execute arbitrary commands only in its E2B sandbox. `write_file` also rejects paths outside the repository workspace.
- Command output is capped before it is returned to the model.
- This is a reference cookbook, not a new SDK. It currently supports public HTTPS repositories and one persistent sandbox per run.

## Test

The tests replace E2B and the Meta API client with local test doubles, so they do not create a sandbox or make an API request.

```bash
uv run pytest
uv run python -m compileall src tests
```

A live end-to-end run creates an E2B sandbox and calls the Meta Model API; it requires explicit approval and a disposable repository.
