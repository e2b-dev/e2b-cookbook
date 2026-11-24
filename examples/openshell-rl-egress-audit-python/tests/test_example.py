"""Offline checks: no sandbox, no model, no network after `uv sync`."""

import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import pytest
from e2b import FileNotFoundException, Sandbox
from openshell import SandboxClient
from openshell._proto import sandbox_pb2

import rollout
from rollout import denied_lines, passed, run_openshell, run_plain, sandbox_policy, verdict
from task import APPLY_FIX, HIDDEN_TEST, POLICIES, SOLUTION_FILE, Policy, buggy_package

# --- the task ---------------------------------------------------------------


def _workspace(tmp_path: Path) -> Path:
    for path, text in buggy_package().items():
        (tmp_path / path).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / path).write_text(text)
    (tmp_path / "hidden_test.py").write_text(HIDDEN_TEST)
    return tmp_path


def _hidden(workdir: Path, nonce: str = "n0nce") -> subprocess.CompletedProcess:
    # Not `-I`: the script's directory must come first on sys.path, as in the grader.
    return subprocess.run(
        [sys.executable, "hidden_test.py", nonce], cwd=workdir, capture_output=True, text=True
    )


def test_hidden_test_fails_on_the_real_buggy_release(tmp_path):
    r = _hidden(_workspace(tmp_path))
    assert r.returncode != 0 and not passed(r.stdout, "n0nce")


def test_honest_repair_command_fixes_it(tmp_path):
    work = _workspace(tmp_path)
    subprocess.run(["sh", "-c", APPLY_FIX], cwd=work, check=True)
    r = _hidden(work)
    assert r.returncode == 0 and passed(r.stdout, "n0nce")


def test_early_exit_candidate_does_not_pass(tmp_path):
    work = _workspace(tmp_path)
    init = work / SOLUTION_FILE
    init.write_text(init.read_text() + "\nimport os\nos._exit(0)\n")
    r = _hidden(work)
    assert r.returncode == 0  # exit code alone would score this
    assert not passed(r.stdout, "n0nce")


# --- the OpenShell log --------------------------------------------------------
# Shapes from OpenShell v0.1.9: crates/openshell-ocsf/src/format/shorthand.rs
# (formatter and its tests), crates/openshell-supervisor-network/src/proxy.rs
# (CONNECT denial) and l7/relay.rs (L7 decision); reason texts from
# crates/openshell-supervisor-network/data/sandbox-policy.rego.
CONNECT_DENIED = (
    "NET:OPEN [MED] DENIED curl(88) -> api.github.com:443 [policy:- engine:opa] "
    "[reason:endpoint api.github.com:443 is not allowed by any policy]"
)
L7_DENIED = (
    "HTTP:GET [MED] DENIED GET https://pypi.org/simple/cachetools/ "
    "[policy:pypi engine:l7] [reason:GET /simple/cachetools/ blocked by deny rule]"
)
# Observed on openshell-e2b (OpenShell v0.1.9) on 2026-11-23.
OBSERVED_DENIED = [
    "HTTP:GET [MED] DENIED GET https://pypi.org/simple/cachetools/ [policy:pypi engine:l7] "
    "[http_event_kind:decision request_sequence:1 reason:L7_REQUEST deny GET "
    "pypi.org:443/simple/cachetools/ reason=GET /simple/cachetools/ blocked by deny rule]",
    "NET:REFUSE [MED] DENIED api.github.com [reason:policy_dns_ineligible]",
    "NET:OPEN [MED] DENIED /usr/bin/curl(0) -> api.github.com:443 "
    "[reason:transparent_tcp_policy_denied]",
]
ALLOWED = (
    "HTTP:GET [INFO] ALLOWED curl(88) -> GET https://api.example.com/v1/data "
    "[policy:default-egress engine:mechanistic]"
)


def _line(level, message):
    return SimpleNamespace(level=level, message=message)


def test_denied_lines_keeps_raw_denials_only():
    logs = [
        _line("OCSF", CONNECT_DENIED),
        _line("OCSF", ALLOWED),
        _line("OCSF", "PROC:LAUNCH [INFO] python3(42) [cmd:python3 /app/main.py]"),
        _line("INFO", L7_DENIED),  # not an OCSF event
        _line("OCSF", L7_DENIED),
    ]
    assert denied_lines(logs) == [CONNECT_DENIED, L7_DENIED]


def test_denied_lines_matches_lines_observed_on_a_live_gateway():
    logs = [_line("OCSF", m) for m in OBSERVED_DENIED]
    logs.append(_line("OCSF", "SSH:OPEN [INFO] ALLOWED"))  # also observed, not a denial
    assert denied_lines(logs) == OBSERVED_DENIED


# --- reward vs. training decision ---------------------------------------------


def test_plain_backend_has_no_record_so_nothing_is_flagged():
    v = verdict("plain", None)
    assert v["denied_attempts"] is None and not v["flagged"] and v["use_for_training"]


def test_observed_denial_flags_even_a_rewarded_rollout():
    v = verdict("openshell", [CONNECT_DENIED])
    assert v["flagged"] and not v["use_for_training"]
    assert v["denied_attempts"] == [CONNECT_DENIED]


def test_no_observed_denial_is_reported_as_best_effort():
    v = verdict("openshell", [])
    assert not v["flagged"] and v["use_for_training"] and v["audit_delivery"] == "best_effort"


# --- the OpenShell policy ------------------------------------------------------


def test_policy_enforces_and_names_the_real_interpreter():
    rule = sandbox_policy().network_policies["pypi"]
    assert set(sandbox_policy().network_policies) == {"pypi"}  # nothing else reachable
    assert [b.path for b in rule.binaries] == ["/usr/local/bin/python3.11"]
    for ep in rule.endpoints:
        # OpenShell's default is audit: violations are logged and forwarded.
        assert ep.enforcement == sandbox_pb2.NETWORK_ENFORCEMENT_MODE_ENFORCE
        assert ep.access == sandbox_pb2.NETWORK_ACCESS_PRESET_READ_ONLY
        assert ep.deny_rules and all(d.method == "*" for d in ep.deny_rules)


# --- lifecycle (mocks are autospecced from the real SDK classes) --------------


def _exec_result(code=0, out=""):
    return SimpleNamespace(exit_code=code, stdout=out, stderr="")


def _gateway(client, logs):
    stub = mock.Mock()
    stub.GetSandboxLogs.return_value = SimpleNamespace(logs=logs)
    gw = rollout.Gateway("127.0.0.1:17691", Path("/unused"))
    return mock.patch.object(
        rollout.Gateway, "connect", return_value=(client, stub, mock.Mock())
    ), gw


def test_openshell_rollout_reads_denials_and_deletes_the_sandbox(monkeypatch):
    monkeypatch.setattr(rollout, "LOG_SETTLE_S", 0)
    client = mock.create_autospec(SandboxClient, instance=True)
    client.exec.return_value = _exec_result(0, "candidate source")
    patch, gw = _gateway(client, [_line("OCSF", L7_DENIED)])
    with patch:
        name, steps, candidate, denials = run_openshell(
            POLICIES["same-host-shortcut"], "abc123", gw
        )
    assert len(name) <= 19
    spec = client.create.call_args.kwargs["spec"]
    assert spec.policy.network_policies["pypi"].endpoints[0].host == "pypi.org"
    assert client.create.call_args.kwargs["labels"] == {rollout.LABEL: "abc123"}
    assert candidate == "candidate source" and denials == [L7_DENIED]
    assert len(steps) == len(POLICIES["same-host-shortcut"].commands)
    client.delete.assert_called_once_with(name, workspace="default", allow_missing=True)
    client.wait_deleted.assert_called_once()


def test_openshell_rollout_deletes_even_when_a_command_fails_to_run():
    client = mock.create_autospec(SandboxClient, instance=True)
    client.exec.side_effect = [_exec_result(), RuntimeError("stream lost")]
    patch, gw = _gateway(client, [])
    with patch, pytest.raises(RuntimeError):
        run_openshell(POLICIES["honest"], "abc123", gw)
    client.delete.assert_called_once()


def test_plain_rollout_kills_the_sandbox_when_setup_fails():
    # Sandbox.kill is both a classmethod and an instance method, which autospec cannot model.
    sbx = mock.Mock(spec=Sandbox)
    sbx.files = mock.Mock()
    sbx.files.write.side_effect = RuntimeError("upload failed")
    with mock.patch.object(rollout.Sandbox, "create", return_value=sbx) as create:
        with pytest.raises(RuntimeError):
            run_plain(POLICIES["honest"], "abc123")
    assert create.call_args.kwargs["network"] == rollout.PLAIN_NETWORK
    sbx.kill.assert_called_once()


def test_parallel_openshell_rollouts_get_their_own_sandbox(monkeypatch):
    monkeypatch.setattr(rollout, "LOG_SETTLE_S", 0)
    client = mock.create_autospec(SandboxClient, instance=True)
    client.exec.return_value = _exec_result()
    patch, gw = _gateway(client, [])
    custom = Policy("model-policy", "not one of the scripted three", ("true",))
    with patch:
        names = [run_openshell(p, "a-long-trainer-run-id", gw)[0] for p in (custom, custom)]
    assert names[0] != names[1] and all(len(n) <= 19 for n in names)
    assert [c.args[0] for c in client.delete.call_args_list] == names  # each deletes its own


def _plain_sandbox(file_chunks):
    sbx = mock.Mock(spec=Sandbox)
    sbx.sandbox_id = "sbx"
    sbx.files = mock.Mock()
    sbx.commands = mock.Mock()
    sbx.commands.run.return_value = SimpleNamespace(exit_code=0, stdout="", stderr="")
    if isinstance(file_chunks, Exception):
        sbx.files.read.side_effect = file_chunks
    else:
        stream = mock.MagicMock()
        stream.__enter__.return_value = file_chunks
        sbx.files.read.return_value = stream
    return sbx


def test_plain_export_stops_reading_past_the_cap():
    chunks = iter([b"x" * 64 * 1024] * 1000)  # a 64 MiB file
    sbx = _plain_sandbox(chunks)
    with mock.patch.object(rollout.Sandbox, "create", return_value=sbx):
        _, _, candidate = run_plain(POLICIES["honest"], "abc123")
    assert sbx.files.read.call_args.kwargs["format"] == "stream"
    assert len(list(chunks)) > 900  # most of the file was never downloaded
    assert rollout.grade(candidate, "abc123") == (0.0, None)  # still rejected as too big


def test_plain_export_of_a_deleted_file_is_nothing_to_grade():
    sbx = _plain_sandbox(FileNotFoundException("gone"))
    with mock.patch.object(rollout.Sandbox, "create", return_value=sbx):
        assert run_plain(POLICIES["honest"], "abc123")[2] is None


def test_sandboxes_left_counts_both_backends():
    client = mock.create_autospec(SandboxClient, instance=True)
    client.list.return_value.all.return_value = ["one-openshell-sandbox"]
    patch, gw = _gateway(client, [])
    pager = SimpleNamespace(next_items=lambda: [])
    with patch, mock.patch.object(rollout.Sandbox, "list", return_value=pager) as e2b_list:
        assert rollout.sandboxes_left("abc123", gw) == 1
    assert e2b_list.call_args.kwargs["query"].metadata == {rollout.LABEL: "abc123"}
    client.list.assert_called_once_with(
        workspace="default", label_selector="openshell-rl-run=abc123"
    )
