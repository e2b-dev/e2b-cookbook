"""Summarize JSONL API request logs: count, server errors, and p95 latency."""

import json
import sys
from pathlib import Path


def summarize(records):
    if not records:
        return {"requests": 0, "server_errors": 0, "p95_ms": 0}
    latencies = sorted(record["latency_ms"] for record in records)
    return {
        "requests": len(records),
        "server_errors": sum(record["status"] == 500 for record in records),
        "p95_ms": latencies[max(0, int(len(latencies) * 0.95) - 1)],
    }


if __name__ == "__main__":
    records = [
        json.loads(line)
        for line in Path(sys.argv[1]).read_text().splitlines()
        if line.strip()
    ]
    print(json.dumps(summarize(records)))
