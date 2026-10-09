# DSPy RLMs with E2B

Run [DSPy RLM](https://dspy.ai/api/modules/RLM/) generated Python in a persistent remote CPython process. This example exports `E2BInterpreter` from a locally installed cookbook project; it is not a separately published PyPI package or a native DSPy import.

DSPy's default Python interpreter already isolates code in local Deno/Pyodide WASM and can inspect inputs outside the prompt. E2B supplies remote Linux with full CPython (`sqlite3`, `subprocess`) and a code-execution deadline that kills the owned sandbox on a hung step. DSPy 3.4.0's default Python interpreter has no code-execution timeout. Model calls and registered Python tools run on your host. The example filters incidents in SQLite, classifies selected passages with sub-model calls, and computes exact counts in SQL; it uses no pandas/numpy.

## Install

Use Python 3.10–3.14 and [uv](https://docs.astral.sh/uv/getting-started/installation/). DSPy is pinned to 3.4.0; the lockfile resolves core E2B 2.53.1. E2B Code Interpreter is not required.

```bash
git clone https://github.com/e2b-dev/e2b-cookbook.git
cd e2b-cookbook/examples/dspy-rlms-python
uv sync --frozen
cp .env.example .env
```

Set `E2B_API_KEY` and `OPENAI_API_KEY` in the ignored `.env`. The optional `MODEL` defaults to `openai/gpt-5.6-luna` ([model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna)). Keys stay on the host and are never passed as sandbox environment variables. Selected input records and code are uploaded to E2B; snippets sent to `llm_query` go to your model provider. Only pass data those services may process.

The LM settings are chosen for OpenAI reasoning models: `temperature=None` and `max_tokens=16000`. `MODEL` changes only the identifier; other models may need different LM parameters in `main.py`. Compatibility with other models is not established.

For another application, install this local project with `pip install /path/to/e2b-cookbook/examples/dspy-rlms-python`, then `from dspy_e2b import E2BInterpreter`. Keep the source checkout or distribute the built wheel under your own maintenance process.

## Check remote SQLite without a model

Save this as `check_sqlite.py` in this directory, then run `uv run check_sqlite.py`. It creates one E2B sandbox and requires only `E2B_API_KEY`.

```python
from dotenv import load_dotenv
from dspy_e2b import E2BInterpreter

load_dotenv()
interpreter = E2BInterpreter()
try:
    interpreter.execute("import sqlite3; db = sqlite3.connect(':memory:')")
    interpreter.execute("db.execute('CREATE TABLE incidents(region TEXT)')")
    interpreter.execute("db.executemany('INSERT INTO incidents VALUES (?)', [('eu',), ('eu',), ('us',)])")
    counts = interpreter.execute("dict(db.execute('SELECT region, count(*) FROM incidents GROUP BY region'))")
    assert counts == {"eu": 2, "us": 1}
    print(counts)
finally:
    interpreter.shutdown()
```

The three inserts and later query use the same in-memory SQLite connection. `shutdown()` deletes the owned sandbox, including its files and processes.

## Analyze incidents with an RLM

```bash
uv run main.py
```

This calls E2B and your model provider. `main.py` loads eight checked-in [incident records](fixtures/incidents.json), configures DSPy, and uses the normal factory argument:

```python
import dspy
from dspy_e2b import E2BInterpreter


class IncidentAnalysis(dspy.Signature):
    records: list[dict] = dspy.InputField()
    query: str = dspy.InputField()
    candidate_ids: list[str] = dspy.OutputField(desc="Exact SQL-filtered IDs, sorted")
    queue_incident_ids: list[str] = dspy.OutputField(desc="IDs classified as queue buildup, sorted")
    counts_by_region: dict[str, int] = dspy.OutputField(desc="SQL counts for queue_incident_ids")
    summary: str = dspy.OutputField(desc="Short explanation grounded in the selected records")


def interpreter_factory():
    return E2BInterpreter(execution_timeout=120, sandbox_timeout=600)


interpreter_factory.execution_instructions = E2BInterpreter.execution_instructions

rlm = dspy.RLM(
    IncidentAnalysis,
    interpreter_factory=interpreter_factory,
    max_iters=6,
    max_llm_calls=4,
    max_output_chars=4000,
)
```

The RLM writes code to select resolved, high-severity inference incidents in SQLite, classifies each candidate with `llm_query` or `llm_query_batched`, and aggregates queue-related incidents by region. Those built-in tools are wired by DSPy and execute on the host. The sandbox needs no outbound network or downloaded packages.

`result.json` contains the answer and native RLM trajectory (generated code, reasoning and execution output). The fixture's exact candidate IDs are `INC-001`, `INC-002`, `INC-004`, `INC-006`. Its labelled queue incidents are `INC-001`, `INC-004`, `INC-006`, with counts `{"eu": 2, "us": 1}`. These are reference labels, not promised model output. The example checks IDs/counts independently and reports `fixture_semantic_labels_match` separately; a successful fixture check is not a general quality evaluation. Review the trajectory to confirm the model actually used SQLite and sub-queries.

The eight-record seed is a small first-run check. To explore a larger input, generate 50,000 low-severity background records locally from that seed:

```bash
uv run main.py --background-records 50000
```

No downloads are needed. The four high-severity candidates stay the same, so the sub-query budget stays at four. RLM inspects the data through generated code instead of putting the entire dataset in its action prompt. This mode still calls E2B and your model provider; inspect the trajectory and result rather than assuming the model will follow the requested plan.

## Observed model runs

With `openai/gpt-5.6-luna`, one run of each configuration produced matching candidate IDs, region counts and fixture semantic labels:

| Input | Elapsed time | RLM steps | Observed behavior |
| --- | --- | --- | --- |
| Eight-record seed | 19 s | 3 | Inspect records; filter in SQLite and call `llm_query_batched` once; aggregate in SQL and SUBMIT from variables. |
| Seed plus 50,000 background records | 30 s | 5 | Inspect type/count/first/last record; filter four candidates in SQLite; call `llm_query_batched` once; aggregate in SQL; SUBMIT from variables. |

Both runs used Python 3.14, DSPy 3.4.0, E2B 2.53.1, `temperature=None`, `max_tokens=16000`, and a 20-second per-request timeout. Each configuration was run once; these results do not estimate reliability or guarantee timings.

Excerpt from the larger-input trajectory, with the SQLite connection and per-candidate prompts prepared in earlier code:

```python
selected = conn.execute("""
    SELECT id, region, summary
    FROM incidents
    WHERE service = 'inference'
      AND status = 'resolved'
      AND severity = 'high'
    ORDER BY rowid
""").fetchall()

print("selected count:", len(selected))
print("selected IDs:", [x[0] for x in selected])

# After building one prompt per selected record:
judgments = llm_query_batched(prompts)
```

The filter printed:

```text
selected count: 4
selected IDs: ['INC-001', 'INC-002', 'INC-004', 'INC-006']
```

The batched answers classified `INC-002` as NO because model loading failed before requests could enter the scheduler. The final answer from that run was:

```json
{
  "candidate_ids": [
    "INC-001",
    "INC-002",
    "INC-004",
    "INC-006"
  ],
  "queue_incident_ids": [
    "INC-001",
    "INC-004",
    "INC-006"
  ],
  "counts_by_region": {
    "eu": 2,
    "us": 1
  },
  "summary": "Four resolved high-severity inference incidents were candidates. Three involved actual request queue buildup (INC-001, INC-004, INC-006); INC-002 did not because requests could not enter the scheduler. Queue incidents by region: eu=2, us=1."
}
```

The example allows six action iterations and four sub-queries. DSPy may make one additional extraction call if the model never submits. Each provider request has a 20-second timeout, no SDK retries or adapter fallback retries, and a 16,000 completion-token budget, including reasoning tokens. These limits bound requests; they do not guarantee a correct answer or a fixed cost. The example factory uses a 120-second execution deadline, including host-tool waiting; the adapter default remains 60 seconds. Prefer `llm_query_batched` for independent prompts and pass computed variables to `SUBMIT`. Neither instruction guarantees model compliance.

## Customize the execution budget

The zero-argument factory above is also used by `main.py`. Change its `execution_timeout` or `sandbox_timeout` for your workload, and preserve `execution_instructions` so the action model sees the environment. A bare `functools.partial` or lambda does not automatically carry those instructions. Every factory call must construct a new interpreter; do not return a shared instance.

## Ownership and limits

- Construction allocates nothing; `start()` or the first `execute()` creates one owned, network-off sandbox. RLM calls `start()` and `shutdown()` around each invocation, including failures. Manual callers use `try/finally` as above.
- Imports, generated variables and files persist between steps of one invocation. Inputs are freshly assigned each execution, matching DSPy 3.4.0. Concurrent invocations have separate sandboxes; overlapping `execute()` calls on one interpreter are rejected.
- The default sandbox TTL is 600 seconds and is refreshed at each execution boundary. It includes model thinking gaps. An expired sandbox fails explicitly; there is no recreation, resume or automatic replay.
- Only JSON-compatible inputs and host-tool results are supported. Inputs above 64 KiB use a single sandbox-local file, bounded to 64 MiB, uploaded again when their content changes. On new content, the worker reads and verifies the file once, then keeps the raw bytes in memory and parses them afresh each step. Mutating inputs or overwriting the transport file does not alter the next input. The 8 MiB frame limit applies to code, tool requests/results and returned values; captured stdout/stderr keeps at most 1 MiB of raw bytes plus `[output truncated]`, and is further trimmed if needed to fit the response after JSON escaping. A large print does not end the session; aggregate received data is limited to 64 MiB per session. This is not unlimited-context support. `max_output_chars` limits prompt text separately.
- At most eight host-tool calls run concurrently per interpreter. Async callables are awaited on host tool threads. Each tool is a host capability: validate arguments and restrict paths/operations inside it. A registered function name alone is not an argument security boundary.
- Syntax and generated-code failures become `SyntaxError`/`CodeExecutionError`, allowing RLM to repair code. Setup, protocol, worker death, deadline and transport failures are terminal `CodeInterpreterError`. All generated threads must finish before their code block ends.
- A terminal failure kills the sandbox. It cannot forcibly stop an already running host callable or provider request; set those deadlines independently. Late replies are discarded. DSPy 3.4.0's `RLM.acall()` invokes synchronous execution and can block the event loop. `dspy.asyncify(rlm)` offloads it to a thread; cancelling that waiter does not stop remote work or the host callable.
- This version uses E2B's base CPython environment. No custom template, guest network, package installation, pool, attach/resume or pandas/numpy support is exposed. Worker processes inherit `PIP_NO_INDEX=1` and `RES_OPTIONS="timeout:1 attempts:1"` so ordinary pip/DNS attempts fail quickly in the network-off base environment. These settings do not replace the network boundary or the execution deadline.

## Diagnose cleanup

`main.py` enables INFO only for the `dspy_e2b` logger to record the safe sandbox ID and random `dspy_session` tag, keeping HTTP libraries at WARNING. For another application, set `logging.getLogger("dspy_e2b").setLevel(logging.INFO)` with an appropriate log handler. Normal shutdown ends the worker stream before sandbox deletion; terminal failures still force deletion. If deletion fails, `shutdown()` raises `CodeInterpreterError` with `sandbox_id`, `session_id`, `cleanup_error`, `original_error` and `last_output` attributes. Cleanup failure can replace the original exception or a valid return; inspect these fields and exception chaining. `last_output` is a submitted `FinalOutput`, not a completed DSPy prediction. Keep the interpreter reference to retry `shutdown()`.

After a host crash, or when that reference is unavailable, list resources by the exact tag from its logs/error:

```bash
uv run cleanup.py YOUR_32_CHARACTER_SESSION_TAG
uv run cleanup.py YOUR_32_CHARACTER_SESSION_TAG --kill
uv run cleanup.py YOUR_32_CHARACTER_SESSION_TAG
```

The first command lists running and paused sandboxes. The second deletes only sandboxes with that exact tag. Re-run the list to confirm absence; a TTL is a backstop, not cleanup evidence.

## Tests

```bash
uv run pytest -q -m 'not live'
uv run ruff check .
uv run ruff format --check .
```

Offline tests execute the real packaged worker through a local transport double, with native DSPy RLM and scripted actions. They do not prove E2B behavior or model quality. The opt-in live test creates bounded E2B sandboxes with the real adapter, uses scripted actions/sub-model labels, exercises SQLite, concurrent isolation, 12 MiB inputs, deadlines and worker death, stdout truncation, overwritten input files and fast pip/DNS recovery, and reconciles its resource tags:

```bash
E2B_LIVE=1 uv run --env-file .env pytest -q -m live
```

This calls E2B but no model provider. It is intentionally excluded from the cookbook's generic live example runner, which already runs inside E2B and would need nested sandbox/provider orchestration. CI runs only offline checks. Actual model-driven verification is a separate run of `main.py`.

The packaged worker is adapted from DSPy 3.4.0 under MIT; see [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES). Changes add bounded protocol/output and verified file-backed input transport.
