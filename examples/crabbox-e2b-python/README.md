# Warm-box test loop with Crabbox + E2B (Python)

This example uses [Crabbox](https://github.com/openclaw/crabbox) to warm one E2B sandbox and reuse it for an iterative test loop. The first run syncs the current Git workset and executes the complete suite. The demo then adds a local regression fixture and runs the focused regression test on the same lease before cleaning everything up.

The only credential is an E2B API key. Crabbox owns the warm lease, workset sync, command orchestration, and streamed output; E2B provides the isolated Linux runtime without Docker or SSH setup.

## What the demo does

1. Warms an E2B `base` sandbox with a unique Crabbox slug.
2. Syncs this example and runs the complete Python test suite.
3. Adds a local enterprise-support regression fixture.
4. Resyncs the working tree and reruns the focused regression test on the same warm sandbox.
5. Removes the temporary fixture and stops the lease, including when a test fails.

## Setup

Install the Crabbox CLI and verify it is available on your `PATH`:

```bash
brew install openclaw/tap/crabbox
crabbox --version
```

Copy the environment template, add an [E2B API key](https://e2b.dev/docs/getting-started/api-key), and load it into the current shell:

```bash
cd examples/crabbox-e2b-python
cp .env.example .env
# Edit .env and set E2B_API_KEY=e2b_...
set -a
source .env
set +a
```

Install the dependency-free project environment and run its local checks:

```bash
uv sync
uv run python -m unittest discover -s tests -v
```

## Run the warm-box demo

```bash
uv run python main.py
```

`main.py` sets this nested example as `CRABBOX_CONFIG`, creates a unique lease name, and runs the equivalent lifecycle:

```bash
crabbox warmup --provider e2b --e2b-template base --slug <lease>
crabbox run --provider e2b --id <lease> --shell '<full test command>'
# Add one local regression fixture.
crabbox run --provider e2b --id <lease> --shell '<focused regression test>'
crabbox stop --provider e2b <lease>
```

Both test commands use the same `--id`, so the second run reuses the already-running E2B sandbox instead of provisioning another one. The temporary regression fixture is a nonignored local file, which makes it part of Crabbox's Git-managed workset for the second sync.

The `.crabbox.yaml` sync include keeps uploads scoped to this example inside the cookbook monorepo. Replace `e2b.template` with a custom E2B template when a real test suite needs additional system dependencies.

A live run creates an E2B sandbox. The driver always attempts `crabbox stop` in a `finally` block, but `crabbox list --provider e2b` can be used to inspect any lease left after a machine or network interruption.
