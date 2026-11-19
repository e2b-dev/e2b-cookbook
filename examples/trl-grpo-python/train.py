"""A small single-process GRPO run with native asynchronous E2B rewards."""

import argparse
import asyncio
import json
import logging
import os
from pathlib import Path

import torch
from datasets import Dataset
from trl import GRPOConfig, GRPOTrainer

from rewards import RewardPool
from tasks import EVAL_TASKS, TRAIN_TASKS


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model", required=True, help="Hugging Face model ID or local directory"
    )
    parser.add_argument("--output-dir", default="training_results")
    parser.add_argument("--sandbox-workers", type=int, default=2)
    parser.add_argument("--create-interval", type=float, default=1.0)
    parser.add_argument("--max-steps", type=int, default=8)
    parser.add_argument("--max-completion-length", type=int, default=256)
    parser.add_argument("--cpu", action="store_true", help="Slow diagnostic run on CPU")
    parser.add_argument(
        "--baseline-only",
        action="store_true",
        help="Evaluate rewards without updating model weights",
    )
    parser.add_argument(
        "--skip-eval", action="store_true", help="Skip before/after evaluation"
    )
    args = parser.parse_args()
    if not args.model.strip() or (args.baseline_only and args.skip_eval):
        parser.error(
            "Supply a model; --baseline-only cannot be combined with --skip-eval"
        )
    if not os.environ.get("E2B_API_KEY"):
        parser.error("Set E2B_API_KEY on the evaluator host")
    if not args.cpu and not torch.cuda.is_available():
        parser.error("Training defaults to a CUDA GPU; use --cpu for a slow diagnostic")
    if args.max_steps < 1 or args.max_completion_length < 1:
        parser.error("Step count and completion length must be positive")

    bf16 = not args.cpu and torch.cuda.is_bf16_supported()
    config = GRPOConfig(
        output_dir=args.output_dir,
        use_cpu=args.cpu,
        bf16=bf16,
        fp16=False,
        model_init_kwargs={"dtype": "bfloat16" if bf16 else "float32"},
        per_device_train_batch_size=2,
        per_device_eval_batch_size=2,
        num_generations=2,
        gradient_accumulation_steps=1,
        max_completion_length=args.max_completion_length,
        max_steps=args.max_steps,
        learning_rate=5e-6,
        gradient_checkpointing=True,
        use_vllm=False,
        report_to="none",
        push_to_hub=False,
        logging_steps=1,
        log_completions=args.baseline_only,
        num_completions_to_print=2,
        save_strategy="no",
        dataloader_pin_memory=not args.cpu,
        seed=42,
    )
    pool = RewardPool(args.sandbox_workers, args.create_interval)
    try:
        trainer = GRPOTrainer(
            model=args.model,
            args=config,
            reward_funcs=pool.code_reward,
            train_dataset=Dataset.from_list(TRAIN_TASKS),
            eval_dataset=Dataset.from_list(EVAL_TASKS),
        )
        metrics = {"model": args.model, "seed": 42, "config": config.to_dict()}
        if args.baseline_only:
            metrics["baseline"] = {
                "train_tasks": trainer.evaluate(
                    eval_dataset=Dataset.from_list(TRAIN_TASKS)
                ),
                "held_out": trainer.evaluate(),
            }
        else:
            if not args.skip_eval:
                metrics["before"] = trainer.evaluate()
            result = trainer.train()
            metrics["train"] = result.metrics
            if not args.skip_eval:
                metrics["after"] = trainer.evaluate()
            checkpoint = Path(args.output_dir) / "checkpoint"
            trainer.save_model(str(checkpoint))
            trainer.processing_class.save_pretrained(str(checkpoint))
        metrics["history"] = trainer.state.log_history
    finally:
        asyncio.run(pool.close())
    metrics["pool"] = pool.metrics()
    filename = "baseline.json" if args.baseline_only else "metrics.json"
    Path(args.output_dir).mkdir(parents=True, exist_ok=True)
    (Path(args.output_dir) / filename).write_text(json.dumps(metrics, indent=2) + "\n")
    if not args.baseline_only:
        print(f"Saved model and tokenizer to {checkpoint}")
    print(f"Saved metrics to {args.output_dir}/{filename}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    main()
