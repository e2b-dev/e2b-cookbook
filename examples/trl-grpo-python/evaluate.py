"""Trusted worker-side orchestration; expected outputs and grading stay on the host."""

import json
import subprocess
import time
from pathlib import Path

ROOT = Path("/opt/e2b-reward")
COMMAND = (
    "/usr/bin/timeout --signal=KILL 2s "
    "unshare --mount --pid --fork --kill-child=KILL --net --ipc --mount-proc "
    "bash /opt/e2b-reward/isolated_run.sh /opt/e2b-reward/solution.py "
    "< /opt/e2b-reward/input.json > /opt/e2b-reward/output.json "
    "2>/dev/null 3> /opt/e2b-reward/status"
)

results = []
for input_text in json.loads((ROOT / "inputs.json").read_text()):
    (ROOT / "input.json").write_text(input_text)
    started = time.monotonic()
    result = subprocess.run(COMMAND, shell=True, check=False)
    elapsed = time.monotonic() - started
    if (ROOT / "status").read_text() != "ready":
        raise RuntimeError("Candidate never entered the isolated Python runtime")
    output = ""
    if result.returncode == 0:
        with (ROOT / "output.json").open("rb") as stream:
            raw = stream.read(65537)
        try:
            output = raw.decode("utf-8")
        except UnicodeDecodeError:
            result.returncode = 1
    results.append(
        {"exit_code": result.returncode, "output": output, "seconds": elapsed}
    )
print(json.dumps(results))
