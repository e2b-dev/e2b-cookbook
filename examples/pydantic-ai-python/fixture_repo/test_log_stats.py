import json
import subprocess
import sys
import unittest

from log_stats import summarize


class LogStatsTests(unittest.TestCase):
    def test_cli(self):
        output = subprocess.check_output(
            [sys.executable, "log_stats.py", "requests.jsonl"], text=True
        )
        self.assertEqual(
            json.loads(output), {"requests": 4, "server_errors": 2, "p95_ms": 100}
        )

    def test_server_errors_exclude_client_errors(self):
        records = [
            {"status": status, "latency_ms": 1}
            for status in [200, 404, 429, 500, 502, 599]
        ]
        self.assertEqual(summarize(records)["server_errors"], 3)

    def test_p95_uses_nearest_rank(self):
        records = [{"status": 200, "latency_ms": value} for value in range(1, 22)]
        self.assertEqual(summarize(records)["p95_ms"], 20)

    def test_empty(self):
        self.assertEqual(
            summarize([]), {"requests": 0, "server_errors": 0, "p95_ms": 0}
        )


if __name__ == "__main__":
    unittest.main()
