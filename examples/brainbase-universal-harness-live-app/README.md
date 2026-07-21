# Live web app with a preview URL on E2B, via the Brainbase Universal Harness API (Python)

In this example a coding agent builds and serves a small web app inside an
isolated [E2B](https://e2b.dev) sandbox, then hands you a live URL to open in a
browser, all through the [Brainbase Universal Harness API](https://docs.brainbaselabs.com/api).
A second message edits the running app on the same sandbox, and the URL keeps
serving the updated version.

## The core call

Create the thread, let the agent build and serve the app, then resolve the preview:

```python
from brainbase_universal_harness_live_app.brainbase import Brainbase

bb = Brainbase()
created = bb.create_thread(APP_PROMPT, harness="claude_code", machine_kind="e2b")
for event in bb.stream_events(created["thread_id"], backfill=100):
    ...  # watch the build stream in until the turn goes idle

thread = bb.get_thread(created["thread_id"])
preview = bb.preview(thread["machine_id"], port=3000)
print(preview.url)   # open this in a browser
```

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
python brainbase_universal_harness_live_app/main.py
```

The agent builds the app, prints the preview URL, then edits the app on a second
turn against the same sandbox and confirms the same URL is still live.

## Notes

- The app is served on port 3000 inside the sandbox; the preview URL maps to that port.
- Open the preview URL directly in a browser. If your deployment returns a token-gated URL instead of a public one, `Preview.headers` carries the header to send.
- Brainbase runs the sandbox lifecycle for you. An idle sandbox shuts down on its own; to stop one immediately, call `DELETE /v2/machines/{id}`.

API docs: <https://docs.brainbaselabs.com/api>. E2B's
[Discord](https://discord.com/invite/U7KEcGErtQ) is a good spot for questions or
to show a preview you built.
