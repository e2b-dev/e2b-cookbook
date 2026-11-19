"""Useful no-model rollout: inspect, run, repair, rerun, submit, reset."""

import json
import time

from dotenv import load_dotenv

from episode import BUGGY, PROGRAM, RUN_REPORT, ReportEpisode, _write


def main():
    load_dotenv()
    episode = ReportEpisode()
    started = time.monotonic()
    ids = []
    rewards = []
    try:
        for repair in (False, True):
            episode.reset()
            ids.append(episode._active_id)
            print(episode.terminal(f"cat {PROGRAM}; cat /home/user/work/sales.csv"))
            print("Before repair:", episode.terminal(RUN_REPORT))
            if repair:
                fixed = BUGGY.replace(
                    '= int(row["amount"])',
                    '= totals.get(row["region"], 0) + int(row["amount"])',
                )
                episode.terminal(_write(PROGRAM, fixed))
                print("After repair:", episode.terminal(RUN_REPORT))
            print(episode.submit())
            rewards.append(episode.get_reward())
        assert rewards == [0.0, 1.0], rewards
        assert len(set(ids)) == 2, ids
        assert len(episode._resources) == len(episode._cleanup) == 4
        assert not episode._owned
    finally:
        episode._close()
        print(
            json.dumps(
                {
                    "rewards": rewards,
                    "sandbox_ids": ids,
                    "verifier_sandbox_ids": [
                        sid
                        for sid, info in episode._resources.items()
                        if info["role"] == "verifier"
                    ],
                    "trace": episode._trace,
                    "cleanup": episode._cleanup,
                    "resources": episode._resources,
                    "total_seconds": round(time.monotonic() - started, 3),
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
