# AG2 Bug-Fixer Agent with E2B

This example gives an [AG2](https://github.com/ag2ai/ag2) agent an E2B sandbox
as its code-execution backend. The agent receives a small Python repository
whose test suite fails, runs the tests, finds the bug, edits the source, and
reruns the tests until they pass. The script then runs the suite itself and
exits with its status, so a green run is proven rather than claimed by the
model.

It uses AG2's `E2BEnvironment` from `ag2.extensions.e2b`. One environment
backs both of the agent's tools, so they share a single sandbox:

- `SandboxShellTool` runs shell commands (read files, edit them, run tests);
- `SandboxCodeTool` runs Python snippets.

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

Add:

- an [E2B API key](https://e2b.dev/docs/getting-started/api-key);
- an OpenAI API key.

`MODEL` can be changed to another OpenAI model that supports the Responses API
and function tools.

### 3. Run the agent

```bash
uv run python main.py
```

The script prints the agent's summary of the root cause and fix, followed by
an independent `python -m unittest -v` run inside the sandbox. It exits with
code `0` only when every test passes.

## How it works

1. `upload_repository()` copies `fixture_repo/` into `/home/user/repo` in the
   sandbox with `put_file`. The sandbox is created on first use.
2. The agent works through `run_shell_command` and `run_code` tool calls. Each
   call runs in the same sandbox, so edits persist between calls.
3. `run_tests()` restores the original `tests/` and runs them after the agent
   replies, so a run where the agent edited or replaced the tests still fails.
   It cannot catch every shortcut, such as special-casing the test inputs in
   the source, so read the agent's diff before trusting a fix.
4. Leaving `async with E2BEnvironment(...)` kills the sandbox, whether the run
   succeeded or raised.

`sandbox_timeout` is the sandbox's server-side lifetime. Tool calls keep
extending it while the agent works, and E2B reclaims the sandbox if the process
dies without cleanup.

`PYTHONDONTWRITEBYTECODE=1` is set for every command. Without it, an in-place
edit that keeps a file's size within the same second can be shadowed by a stale
`.pyc`, and the agent would see a correct fix fail.

## Tests

The offline tests replace E2B with AG2's `LocalEnvironment` and script the model
with `ag2.testing.TestConfig`, so they need no API keys:

```bash
uv run pytest
```

## Security notes

The sandbox isolates agent-written commands and code from the machine running
AG2, but treat tool inputs and outputs as untrusted:

- do not put API keys or other secrets in prompts or sandbox files;
- keep the command and sandbox timeouts as short as the task allows;
- close the environment explicitly, as this example does with `async with`.

See the [AG2 E2B extension guide](https://docs.ag2.ai/latest/docs/user-guide/extensions/e2b)
and the [E2B sandbox lifecycle documentation](https://e2b.dev/docs/sandbox) for
more details.
