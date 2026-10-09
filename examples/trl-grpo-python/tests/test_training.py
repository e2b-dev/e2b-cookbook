"""Optional training check using a tiny local model and synthetic rewards."""

import json
import sys

import pytest


@pytest.mark.parametrize("baseline_only", [False, True])
def test_cli_native_async_callback_training_and_checkpoint(
    tmp_path, monkeypatch, baseline_only
):
    monkeypatch.setenv("HF_HUB_DISABLE_TELEMETRY", "1")
    pytest.importorskip("trl")
    import torch
    from tokenizers import Tokenizer, models, pre_tokenizers
    from transformers import GPT2Config, GPT2LMHeadModel, PreTrainedTokenizerFast

    import train

    torch.manual_seed(42)
    tokenizer = Tokenizer(
        models.WordLevel(
            {"<pad>": 0, "<eos>": 1, "<unk>": 2, "code": 3}, unk_token="<unk>"
        )
    )
    tokenizer.pre_tokenizer = pre_tokenizers.Whitespace()
    tokenizer = PreTrainedTokenizerFast(
        tokenizer_object=tokenizer,
        pad_token="<pad>",
        eos_token="<eos>",
        unk_token="<unk>",
    )
    tokenizer.chat_template = "{% for m in messages %}{{ m['content'] }}{% endfor %}"
    model = GPT2LMHeadModel(
        GPT2Config(
            vocab_size=4,
            n_layer=1,
            n_head=2,
            n_embd=16,
            n_positions=512,
            bos_token_id=1,
            eos_token_id=1,
            pad_token_id=0,
        )
    )
    source = tmp_path / "source"
    model.save_pretrained(source)
    tokenizer.save_pretrained(source)
    before = model.transformer.wte.weight.detach().clone()
    calls = []

    async def reward(completions, test_cases, **kwargs):
        assert len(completions) == len(test_cases)
        assert all(json.loads(cases[0]["input"]) == [] for cases in test_cases)
        calls.append(len(completions))
        return [float(i % 2) for i in range(len(completions))]

    output = tmp_path / "output"

    class Pool:
        def __init__(self, *args):
            self.code_reward = reward
            self.closed = False
            pools.append(self)

        async def close(self):
            self.closed = True

        def metrics(self):
            assert self.closed
            return {"offline": True}

    pools = []
    monkeypatch.setattr(train, "RewardPool", Pool)
    monkeypatch.setenv("E2B_API_KEY", "offline-placeholder")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "train.py",
            "--model",
            str(source),
            "--cpu",
            "--max-steps",
            "1",
            "--max-completion-length",
            "4",
            "--output-dir",
            str(output),
        ],
    )
    if baseline_only:
        sys.argv.append("--baseline-only")

        def forbid_training(*args, **kwargs):
            pytest.fail("Baseline must not update model weights")

        monkeypatch.setattr(train.GRPOTrainer, "train", forbid_training)
    train.main()
    if baseline_only:
        metrics = json.loads((output / "baseline.json").read_text())
        assert metrics["baseline"]["train_tasks"]["eval_reward"] == 0.5
        assert metrics["baseline"]["held_out"]["eval_reward"] == 0.5
        assert "train" not in metrics
        assert not (output / "checkpoint").exists()
        assert pools[0].closed
        return
    metrics = json.loads((output / "metrics.json").read_text())
    assert "before" in metrics and "after" in metrics and "train" in metrics
    assert metrics["before"]["eval_reward"] == 0.5
    assert metrics["after"]["eval_reward"] == 0.5
    assert any(log.get("step") == 1 for log in metrics["history"])
    assert calls
    assert pools[0].closed
    assert metrics["pool"] == {"offline": True}
    reloaded = GPT2LMHeadModel.from_pretrained(output / "checkpoint")
    assert not torch.equal(before, reloaded.transformer.wte.weight)
    PreTrainedTokenizerFast.from_pretrained(output / "checkpoint")
