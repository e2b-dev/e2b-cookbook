# Fix failing tests on E2B with the Brainbase Universal Harness API (Python)

This example gives a coding agent a small Python project whose `pytest` suite is
red on purpose, then lets it work inside an isolated [E2B](https://e2b.dev) sandbox
through the [Brainbase Universal Harness API](https://docs.brainbaselabs.com/api).
One API call describes the agent and seeds the project. The agent runs the tests,
finds the bug, fixes it, and re-runs pytest until the suite is green. A second turn
then adds a feature on the same warm sandbox.

## The core call

One `POST /v2/threads` describes the agent inline and starts the first turn:

```python
from brainbase_universal_harness_fix_tests.brainbase import Brainbase

bb = Brainbase()  # reads BRAINBASE_API_KEY from the environment
created = bb.create_thread(
    "Run pytest, find the bug in roman.py, and fix it so every test passes.",
    harness="claude_code",
    machine_kind="e2b",   # run the sandbox on E2B
    entrypoint=SEED,      # bash that seeds the buggy project and installs pytest
)
for event in bb.stream_events(created["thread_id"], backfill=100):
    ...  # assistant text, tool calls, and the turn's idle outcome stream in
```

The agent is `claude_code` by default. Swap `harness` for `codex`, `cursor`,
`factory`, `kafka_cloud`, `opencode`, `qoder`, or `qwen` and nothing else
changes.

---

## How to run example

**1. Set your Brainbase API key**

Copy `.env.template` to `.env` and paste in your key from
[app.brainbaselabs.com/api-keys](https://app.brainbaselabs.com/api-keys). You do
not need an E2B key; Brainbase provisions the E2B sandbox for you.

```
cp .env.template .env
```

**2. Create a virtual environment**

```
python -m venv .venv
```

**3. Activate the virtual environment**

macOS/Unix

```
source .venv/bin/activate
```

Windows

```
.venv\Scripts\activate
```

**4. Install dependencies**

```
pip install -e .
```

**5. Run the example**

```
python brainbase_universal_harness_fix_tests/main.py
```

You will see the agent's messages and tool calls stream in, the E2B sandbox it
ran on, and the final transcript.

## Notes

- Brainbase manages the sandbox lifecycle. Idle sandboxes stop on their own, and you can stop one right away with `DELETE /v2/machines/{id}`.

Full API reference: <https://docs.brainbaselabs.com/api>. For questions, or to
share what you built, try E2B's [Discord](https://discord.com/invite/U7KEcGErtQ).
