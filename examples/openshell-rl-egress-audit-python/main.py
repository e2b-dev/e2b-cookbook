"""Run the three scripted policies on one backend and print a JSON receipt."""

from __future__ import annotations

import argparse
import json
import secrets
import time
from pathlib import Path

from dotenv import load_dotenv

from rollout import Gateway, rollout, sandboxes_left
from task import POLICIES


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", choices=["plain", "openshell"], default="plain")
    parser.add_argument("--policy", choices=sorted(POLICIES), action="append")
    parser.add_argument("--steps", action="store_true", help="include each command's output")
    args = parser.parse_args()
    load_dotenv(Path(__file__).with_name(".env"))  # this example's .env only

    gw = Gateway.from_env() if args.backend == "openshell" else None
    run_id = secrets.token_hex(3)
    started = time.monotonic()
    results = []
    for name in args.policy or list(POLICIES):
        result = rollout(POLICIES[name], args.backend, run_id, gw).to_json()
        if not args.steps:
            result.pop("steps")
        results.append(result)
    print(
        json.dumps(
            {
                "backend": args.backend,
                "run_id": run_id,
                "rollouts": results,
                "sandboxes_left": sandboxes_left(run_id, gw),
                "seconds": round(time.monotonic() - started, 1),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
