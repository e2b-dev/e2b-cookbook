"""Optional CPU check: scripted tool tokens, synthetic env rewards, real optimizer."""

import sys

import pytest


def test_native_environment_factory_tool_loop_and_optimizer(tmp_path, monkeypatch):
    pytest.importorskip("trl")
    import torch
    from tokenizers import Tokenizer, models, pre_tokenizers
    from transformers import GPT2Config, GPT2LMHeadModel, PreTrainedTokenizerFast
    from trl import GRPOTrainer
    from trl.chat_template_utils import qwen3_chat_template, qwen3_template

    import train

    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    monkeypatch.setenv("HF_HUB_DISABLE_TELEMETRY", "1")
    vocab = {
        "<pad>": 0,
        "<|im_end|>": 1,
        "<unk>": 2,
        "done": 3,
        "<tool_call>": 4,
        '{"name":"submit","arguments":{}}': 5,
        "</tool_call>": 6,
    }
    raw = Tokenizer(models.WordLevel(vocab, unk_token="<unk>"))
    raw.pre_tokenizer = pre_tokenizers.WhitespaceSplit()
    tokenizer = PreTrainedTokenizerFast(
        tokenizer_object=raw,
        pad_token="<pad>",
        eos_token="<|im_end|>",
        unk_token="<unk>",
    )
    tokenizer.chat_template = qwen3_chat_template
    # Synthetic vocabulary collapses the assistant prefix into its unknown token.
    tokenizer.response_template = {**qwen3_template, "start_anchor": "<unk>"}
    torch.manual_seed(7)
    model = GPT2LMHeadModel(
        GPT2Config(
            vocab_size=7,
            n_layer=1,
            n_head=2,
            n_embd=16,
            n_positions=2048,
            bos_token_id=1,
            eos_token_id=1,
            pad_token_id=0,
        )
    )
    before = model.transformer.wte.weight.detach().clone()
    source = tmp_path / "source"
    model.save_pretrained(source)
    tokenizer.save_pretrained(source)
    instances = []
    calls = []

    class FakeEpisode:
        def __init__(self):
            self._trace = []
            self._cleanup = []
            self._reward = len(instances) % 2
            instances.append(self)

        def reset(self, **kwargs):
            assert kwargs["task"]["expected"] == {"east": 15, "west": 7}
            calls.append("reset")
            return None

        def submit(self) -> str:
            """Submit the task solution."""
            calls.append("submit")
            return "submitted"

        def get_reward(self):
            calls.append("reward")
            self._close()
            return float(self._reward)

        def _close(self):
            calls.append("close")

    generations = []

    def scripted_tokens(
        trainer, prompt_ids, images, multimodal_fields, num_generations, **kwargs
    ):
        generations.append(len(prompt_ids))
        ids = [4, 5, 6, 1] if len(generations) == 1 else [3, 1]
        return [ids[:] for _ in prompt_ids], None

    monkeypatch.setattr(train, "ReportEpisode", FakeEpisode)
    monkeypatch.setattr(GRPOTrainer, "_generate_single_turn", scripted_tokens)
    output = tmp_path / "output"
    monkeypatch.setattr(
        sys,
        "argv",
        ["train.py", "--model", str(source), "--cpu", "--output-dir", str(output)],
    )
    train.main()
    assert calls.count("reset") == 2
    assert calls.count("submit") == 2
    assert calls.count("reward") == 2
    assert len(generations) == 2
    reloaded = GPT2LMHeadModel.from_pretrained(output / "checkpoint")
    assert not torch.equal(before, reloaded.transformer.wte.weight)
