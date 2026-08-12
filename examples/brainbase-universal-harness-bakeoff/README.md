# Multi-harness bake-off on E2B, via the Brainbase Universal Harness API (Python)

This example hands several coding-agent harnesses the same broken function and
asks each to fix it, every one in its own isolated [E2B](https://e2b.dev) sandbox,
through the [Brainbase Universal Harness API](https://docs.brainbaselabs.com/api).
When a run finishes, the script downloads that harness's `solution.py` and grades
it against a hidden test suite the agent never saw, running the code in a
subprocess with a timeout. It then ranks the harnesses by score, breaks ties by
wall-time, and tears the sandboxes down. The unfixed baseline scores 0/12, so
every point is a real fix.

## The core idea

Each harness runs the same task in its own sandbox, and the tests stay on your side:

```python
from brainbase_universal_harness_bakeoff.brainbase import Brainbase

bb = Brainbase()
created = bb.create_thread(TASK, harness="opencode", machine_kind="e2b")
thread = bb.wait(created["thread_id"])                     # poll until it settles
source = bb.download(created["thread_id"], "solution.py")  # pull the artifact
passed, total, note = grade(source.decode())               # run hidden tests locally
```

Because the agent only sees the spec and never the tests, it cannot game the
score, and any tests it writes itself do not count.

---

## How to run example

**1. Set your Brainbase API key**

Copy `.env.template` to `.env` and paste in your key from
[app.brainbaselabs.com/api-keys](https://app.brainbaselabs.com/api-keys). You do
not need an E2B key; Brainbase provisions the E2B sandboxes for you.

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
python brainbase_universal_harness_bakeoff/main.py
```

It launches the harnesses in parallel, prints each result as it lands, then a
ranked table, then tears the sandboxes down.

## Notes

- The harness matrix is at the top of `main.py`. Not every harness runs on every provider; an unavailable one shows up as an error row instead of stopping the run.
- Grading runs the returned code locally in a subprocess (`-I`, 15s timeout). If you would rather not run model output on your machine, push the tests into each sandbox and run them there.
- Each finished sandbox is torn down with `DELETE /v2/machines/{id}`, so idle boxes do not keep costing credits.

API docs: <https://docs.brainbaselabs.com/api>. Bring questions, or your own
bake-off numbers, to E2B's [Discord](https://discord.com/invite/U7KEcGErtQ).
