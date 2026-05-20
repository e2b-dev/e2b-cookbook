from __future__ import annotations

import argparse

from e2b import Sandbox

from config import E2B_WORKER_SANDBOX_ID


def main() -> None:
    parser = argparse.ArgumentParser(description="Stop an E2B Managed Agents worker sandbox.")
    parser.add_argument("sandbox_id", nargs="?", default=E2B_WORKER_SANDBOX_ID)
    args = parser.parse_args()

    if not args.sandbox_id:
        raise RuntimeError("sandbox id required, or set E2B_WORKER_SANDBOX_ID")

    Sandbox.kill(args.sandbox_id)
    print(f"killed {args.sandbox_id}")


if __name__ == "__main__":
    main()

