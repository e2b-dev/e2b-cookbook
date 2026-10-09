"""Optional native TRL training wiring; model task success is not established."""

import argparse
import json
from pathlib import Path

from dotenv import load_dotenv

from episode import TASK, ReportEpisode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        required=True,
        help="Tool-capable Transformers model ID or local checkpoint",
    )
    parser.add_argument("--max-steps", type=int, default=1)
    parser.add_argument("--cpu", action="store_true")
    parser.add_argument("--output-dir", default="training-output")
    args = parser.parse_args()
    load_dotenv()
    from datasets import Dataset
    from trl import GRPOConfig, GRPOTrainer

    owners = []

    def factory():
        episode = ReportEpisode()
        owners.append(episode)
        return episode

    config = GRPOConfig(
        output_dir=args.output_dir,
        per_device_train_batch_size=2,
        num_generations=2,
        max_steps=args.max_steps,
        max_completion_length=512,
        learning_rate=1e-6,
        save_strategy="no",
        report_to="none",
        use_cpu=args.cpu,
        bf16=not args.cpu,
    )
    dataset = Dataset.from_list(
        [
            {
                "prompt": [{"role": "user", "content": TASK["prompt"]}],
                "task": TASK,
            }
        ]
    )
    try:
        trainer = GRPOTrainer(
            model=args.model,
            args=config,
            train_dataset=dataset,
            environment_factory=factory,
        )
        trainer.train()
        trainer.save_model(str(Path(args.output_dir) / "checkpoint"))
    finally:
        failures = []
        for owner in owners:
            try:
                owner._close()
            except Exception as exc:
                failures.append(exc)
        print(
            json.dumps(
                {
                    "trace": [item for e in owners for item in e._trace],
                    "cleanup": [item for e in owners for item in e._cleanup],
                },
                indent=2,
            )
        )
        if failures:
            raise ExceptionGroup("Training cleanup failed", failures)


if __name__ == "__main__":
    main()
