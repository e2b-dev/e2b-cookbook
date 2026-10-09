import json
import logging
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

import cleanup
import main


def test_fixture_assessment_separates_semantics_and_exact_counts():
    records = json.loads(Path(main.__file__).with_name("fixtures").joinpath("incidents.json").read_text())
    result = SimpleNamespace(
        candidate_ids=["INC-001", "INC-002", "INC-004", "INC-006"],
        queue_incident_ids=["INC-001", "INC-004", "INC-006"],
        counts_by_region={"eu": 2, "us": 1},
    )
    assert main.assess_fixture(records, result)["fixture_semantic_labels_match"]
    result.queue_incident_ids = ["INC-002"]
    result.counts_by_region = {"us": 1}
    assert not main.assess_fixture(records, result)["fixture_semantic_labels_match"]
    result.counts_by_region = {"us": 2}
    with pytest.raises(ValueError, match="counts"):
        main.assess_fixture(records, result)
    result.candidate_ids = ["INC-005"]
    with pytest.raises(ValueError, match="IDs"):
        main.assess_fixture(records, result)


def test_cleanup_targets_exact_session(monkeypatch, capsys):
    tag = "a" * 32
    found = SimpleNamespace(sandbox_id="owned", state="running")
    killed = []

    class Paginator:
        has_next = True

        def next_items(self):
            self.has_next = False
            return [found]

    def list_owned(query, **kwargs):
        assert query.metadata == {"dspy_session": tag}
        return Paginator()

    monkeypatch.setattr(cleanup.Sandbox, "list", list_owned)
    monkeypatch.setattr(cleanup.Sandbox, "kill", lambda sandbox_id, **kwargs: killed.append(sandbox_id))
    monkeypatch.setattr(cleanup, "load_dotenv", lambda: None)
    monkeypatch.setattr(sys, "argv", ["cleanup.py", tag])
    cleanup.main()
    assert not killed
    monkeypatch.setattr(sys, "argv", ["cleanup.py", tag, "--kill"])
    cleanup.main()
    assert killed == ["owned"] and "deletion acknowledged" in capsys.readouterr().out
    monkeypatch.setattr(sys, "argv", ["cleanup.py", "invalid", "--kill"])
    with pytest.raises(SystemExit):
        cleanup.main()
    assert killed == ["owned"]


@pytest.mark.parametrize("argv", [[], ["--background-records", "50000"]])
def test_actual_main_with_scripted_actions(transport, monkeypatch, tmp_path, capsys, argv):
    import dspy
    from test_live import SEMANTICS, SQL_SETUP, SUBMIT, Actions

    original = dspy.RLM

    def scripted(*args, **kwargs):
        value = original(*args, **kwargs)
        value.generate_action = Actions([SQL_SETUP, SEMANTICS, SUBMIT])
        value.sub_lm = lambda prompt: ["other" if "tokenizer" in prompt else "queue"]
        return value

    monkeypatch.setattr(dspy, "RLM", scripted)
    monkeypatch.setattr(main, "load_dotenv", lambda: None)
    monkeypatch.setenv("E2B_API_KEY", "not-used-by-transport-double")
    monkeypatch.setenv("OPENAI_API_KEY", "not-used-by-scripted-actions")
    monkeypatch.delenv("MODEL", raising=False)
    monkeypatch.chdir(tmp_path)
    main.main(argv)
    result = json.loads(Path("result.json").read_text())
    assert result["answer"]["counts_by_region"] == {"eu": 2, "us": 1}
    assert result["fixture_assessment"]["fixture_semantic_labels_match"]
    assert len(result["trajectory"]) == 3
    assert transport[0].kills == 1
    assert not dspy.settings.adapter.use_json_adapter_fallback
    assert dspy.settings.lm.num_retries == 0
    assert dspy.settings.lm.model == "openai/gpt-5.6-luna"
    assert dspy.settings.lm.kwargs["temperature"] is None
    assert dspy.settings.lm.kwargs["max_completion_tokens"] == 16000
    assert dspy.settings.lm.kwargs["timeout"] == 20
    assert dspy.settings.lm.cache is False
    assert "Scripted fixture" in capsys.readouterr().out
    assert logging.getLogger("dspy_e2b").level == logging.INFO
    assert logging.getLogger("httpx").getEffectiveLevel() > logging.INFO
    configured = main.interpreter_factory()
    assert configured.execution_timeout == 120 and configured.sandbox_timeout == 600
    configured.shutdown()


def test_locally_generated_background_keeps_candidate_fixture():
    records = main.load_records(1000)
    assert len(records) == 1008 and len({row["id"] for row in records}) == 1008
    assert all(row["severity"] == "low" for row in records[8:])
    records[8]["summary"] = "changed"
    assert records[10]["summary"] != "changed" and records[6]["summary"] != "changed"
    result = SimpleNamespace(
        candidate_ids=["INC-001", "INC-002", "INC-004", "INC-006"],
        queue_incident_ids=["INC-001", "INC-004", "INC-006"],
        counts_by_region={"eu": 2, "us": 1},
    )
    assert main.assess_fixture(records, result)["fixture_semantic_labels_match"]
    with pytest.raises(ValueError, match="non-negative"):
        main.load_records(-1)
