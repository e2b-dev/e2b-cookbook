"""Offline contracts: task scoring, ownership, expiry and TRL tool discovery."""

import inspect
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace as NS

import pytest

import episode as module
from episode import TASK, InfrastructureError, ReportEpisode, score_report


@pytest.mark.parametrize(
    "output,reward",
    [
        ('{"east":15,"west":7}', 1.0),
        ('{"east":5,"west":7}', 0.0),
        ('{"east":15,"west":7,"extra":0}', 0.0),
        ("{}\n{}", 0.0),
        ('{"east":true,"west":7}', 0.0),
        ('{"east":15.0,"west":7}', 0.0),
        ("ERROR: program failed", 0.0),
    ],
)
def test_score_exact_report(output, reward):
    assert score_report(output, TASK["expected"]) == reward


@pytest.fixture
def episode(monkeypatch):
    owned = set()
    calls = []
    handles = {}
    config = {"output": b'{"north":8,"south":1}', "exit_code": 0}

    class Files:
        def __init__(self, sandbox_id):
            self._id = sandbox_id
            self.data = {module.PROGRAM: module.BUGGY.encode()}

        @contextmanager
        def read(self, path, **kwargs):
            calls.append(("read", self._id, path, kwargs))
            if path not in self.data:
                raise module.FileNotFoundException("missing")
            try:
                data = self.data[path]
                yield (data[i : i + 4096] for i in range(0, len(data), 4096))
            finally:
                calls.append(("stream_closed", self._id, path))

        def write(self, path, data, **kwargs):
            calls.append(("write", self._id, path))
            self.data[path] = data.encode() if isinstance(data, str) else data

    class Commands:
        def __init__(self, files):
            self.files = files

        def run(self, command, **kwargs):
            calls.append(("run", command, kwargs))
            self.files.data[module.REPORT_OUTPUT] = config["output"]
            if config["exit_code"]:
                raise module.CommandExitException("", "", config["exit_code"], "failed")
            return NS(exit_code=0)

    def handle(sandbox_id):
        files = Files(sandbox_id)
        value = NS(sandbox_id=sandbox_id, files=files, commands=Commands(files))
        handles[sandbox_id] = value
        return value

    class SDK:
        @staticmethod
        def get_info(sandbox_id, **kwargs):
            if sandbox_id not in owned:
                raise module.SandboxNotFoundException("absent")
            return NS(
                state="running",
                started_at=datetime.now(timezone.utc),
                cpu_count=2,
                memory_mb=512,
                template_id="test",
            )

        @staticmethod
        def kill(sandbox_id, **kwargs):
            calls.append(("kill", sandbox_id))
            owned.discard(sandbox_id)

        @staticmethod
        def set_timeout(sandbox_id, seconds, **kwargs):
            calls.append(("ttl", sandbox_id, seconds))

        @staticmethod
        def connect(sandbox_id, **kwargs):
            calls.append(("connect", sandbox_id))
            return handle(sandbox_id)

        @staticmethod
        def create(**kwargs):
            sandbox_id = "verifier-" + str(len(calls))
            calls.append(("create", kwargs))
            owned.add(sandbox_id)
            return handle(sandbox_id)

    class Client:
        def __init__(self, **kwargs):
            self._id = "owned-" + str(len(calls))

        def sync(self):
            return self

        def reset(self, **kwargs):
            owned.add(self._id)
            calls.append(("reset", kwargs))
            return NS(
                observation=NS(metadata={"status": "ready", "sandbox_id": self._id})
            )

        def step(self, action):
            calls.append(("step", action.arguments))
            # Native reward is deliberately forged and must not become the task score.
            result = NS(content=[NS(text='{"east":5,"west":7}')], is_error=False)
            return NS(reward=1.0, observation=NS(error=None, result=result))

        def state(self):
            return NS(model_dump=lambda: {"commands": []})

        def close(self):
            calls.append(("close", self._id))

    monkeypatch.setattr(module, "Sandbox", SDK)
    monkeypatch.setattr(module, "TerminusEnv", Client)
    monkeypatch.setattr(module, "_pace_creation", lambda: None)
    value = ReportEpisode()
    value._test_owned = owned
    value._test_calls = calls
    value._test_handles = handles
    value._test_config = config
    yield value
    value._close()


def test_constructor_allocates_nothing_and_exposes_only_two_model_tools(episode):
    assert not episode._test_calls
    methods = [
        name
        for name, member in inspect.getmembers(episode, inspect.ismethod)
        if not name.startswith("_") and name not in ("reset", "get_reward")
    ]
    assert methods == ["submit", "terminal"]


def test_scoring_ignores_native_reward_and_closes_before_optimizer(episode):
    episode.reset()
    sandbox_id = episode._active_id
    assert episode.submit() == "Report reward: 0.0"
    assert (
        episode.terminal("echo dangerous")
        == "Episode finished; no further commands allowed."
    )
    assert episode.get_reward() == 0.0
    assert sandbox_id not in episode._test_owned
    assert episode._cleanup[-1]["status"] == "confirmed absent"


def test_no_submission_zero_only_when_healthy(episode):
    episode.reset()
    assert episode.get_reward() == 0.0
    episode.reset()
    episode._test_owned.clear()
    with pytest.raises(InfrastructureError):
        episode.get_reward()


def test_reset_is_fresh_and_reconciles_previous_episode(episode):
    episode.reset()
    previous = episode._active_id
    episode.reset()
    assert episode._active_id != previous
    assert previous not in episode._test_owned
    assert len(episode._test_owned) == 1
    assert any(call[0] == "ttl" and call[2] == 600 for call in episode._test_calls)


def test_deadline_and_tool_error_are_fatal_even_if_trl_catches_tool_error(episode):
    episode.reset()
    episode._deadline = time.monotonic() - 1
    with pytest.raises(InfrastructureError):
        episode.terminal("pwd")
    with pytest.raises(InfrastructureError):
        episode.get_reward()
    assert not episode._test_owned


def test_failed_cleanup_retains_ids_for_retry(episode, monkeypatch):
    episode.reset()
    sdk_kill = module.Sandbox.kill
    monkeypatch.setattr(
        module.Sandbox,
        "kill",
        lambda *a, **kw: (_ for _ in ()).throw(OSError("offline")),
    )
    with pytest.raises(InfrastructureError, match="Cleanup unresolved: owned-"):
        episode._close()
    assert episode._owned == episode._test_owned
    monkeypatch.setattr(module.Sandbox, "kill", sdk_kill)
    episode._close()
    assert not episode._owned


def test_setup_failure_keeps_acquired_id_for_cleanup(episode, monkeypatch):
    original = module.TerminusEnv.reset

    def failed(client, **kwargs):
        result = original(client, **kwargs)
        result.observation.metadata["status"] = "error"
        return result

    monkeypatch.setattr(module.TerminusEnv, "reset", failed)
    with pytest.raises(InfrastructureError):
        episode.reset()
    assert not episode._test_owned
    assert len(episode._cleanup) == 1


@pytest.mark.parametrize(
    "output",
    [
        "ERROR:\nSystemExit: -9",
        "ERROR:\nSystemExit: 124",
        "ERROR:\nSystemExit: 137",
        "ERROR: SystemExit: 137",  # Ordinary policy stdout can contain this text.
    ],
)
def test_completed_command_errors_are_policy_observations(episode, monkeypatch, output):
    episode.reset()
    monkeypatch.setattr(
        module.TerminusEnv,
        "step",
        lambda client, action: NS(
            observation=NS(
                error=None,
                result=NS(
                    content=[NS(text=output)],
                    is_error=False,
                ),
            )
        ),
    )
    assert episode.terminal("sleep 12") == output
    assert episode.get_reward() == 0.0
    assert not episode._test_owned


def test_lost_response_is_fatal_and_does_not_expose_exception_content(
    episode, monkeypatch
):
    episode.reset()

    def lost_response(client, action):
        raise TimeoutError("sensitive request content")

    monkeypatch.setattr(module.TerminusEnv, "step", lost_response)
    with pytest.raises(
        InfrastructureError, match=r"step failed \(TimeoutError\)"
    ) as error:
        episode.terminal("pwd")
    assert "sensitive" not in str(error.value)
    with pytest.raises(InfrastructureError, match=r"step failed \(TimeoutError\)"):
        episode.get_reward()
    assert not episode._test_owned


def test_safe_protocol_diagnosis_survives_wrapping_and_reward_boundary(
    episode, monkeypatch
):
    episode.reset()
    monkeypatch.setattr(
        module.TerminusEnv,
        "step",
        lambda client, action: NS(
            observation=NS(error=None, result={"bad": "response"})
        ),
    )
    with pytest.raises(InfrastructureError, match="Malformed OpenEnv tool response"):
        episode.terminal("pwd")
    with pytest.raises(InfrastructureError, match="Malformed OpenEnv tool response"):
        episode.get_reward()
    assert not episode._test_owned


def test_malformed_protocol_response_is_not_a_report_score():
    with pytest.raises(InfrastructureError):
        module._text(NS(error=None, result={"unexpected": "protocol change"}))


def test_submission_copies_only_source_after_deleting_policy_and_commits_after_cleanup(
    episode,
):
    episode.reset()
    policy_id = episode._active_id
    artifact = b"# repaired candidate"
    episode._policy.files.data[module.PROGRAM] = artifact
    episode._test_config["output"] = b'{"north":11,"south":5}'
    assert episode.submit() == "Report reward: 1.0"
    calls = episode._test_calls
    create_index = next(i for i, call in enumerate(calls) if call[0] == "create")
    assert calls.index(("kill", policy_id)) < create_index
    assert calls[create_index][1] == {
        "template": "test",
        "timeout": 120,
        "allow_internet_access": False,
        "request_timeout": 10,
    }
    verifier_id = next(sid for sid in episode._test_handles if sid != policy_id)
    files = episode._test_handles[verifier_id].files.data
    assert files[module.PROGRAM] == artifact
    assert files["/home/user/work/sales.csv"] == TASK["verification"]["input"].encode()
    assert {call[2] for call in calls if call[0] == "write"} == {
        module.PROGRAM,
        "/home/user/work/sales.csv",
    }
    assert len([call for call in calls if call[0] == "connect"]) == 1
    assert not episode._owned and not episode._test_owned
    assert len(episode._cleanup) == 2
    episode._deadline = 0
    assert episode.get_reward() == 1.0  # Resources are already gone.
    assert episode.submit() == "Episode already submitted."


@pytest.mark.parametrize(
    "exit_code,output",
    [
        (1, b'{"north":11,"south":5}'),
        (137, b'{"north":11,"south":5}'),
        (0, b'{"east":15,"west":7}'),
        (0, b"not JSON"),
        (0, b"\xff"),
        (0, b"x" * (module.MAX_FILE_BYTES + 1)),
    ],
)
def test_verifier_rejects_nonzero_timeout_visible_hardcode_and_invalid_output(
    episode, exit_code, output
):
    episode.reset()
    episode._test_config.update(exit_code=exit_code, output=output)
    episode.submit()
    assert episode.get_reward() == 0.0
    assert not episode._test_owned


@pytest.mark.parametrize("artifact", [None, b"x" * (module.MAX_FILE_BYTES + 1)])
def test_missing_or_oversized_artifact_closes_policy_without_verifier(
    episode, artifact
):
    episode.reset()
    if artifact is None:
        del episode._policy.files.data[module.PROGRAM]
    else:
        episode._policy.files.data[module.PROGRAM] = artifact
    episode.submit()
    assert episode.get_reward() == 0.0
    assert not any(call[0] == "create" for call in episode._test_calls)
    assert not episode._test_owned
    if artifact is not None:
        assert any(call[0] == "stream_closed" for call in episode._test_calls)


@pytest.mark.parametrize("stage", ["export", "create", "upload", "execute"])
def test_submission_transport_failure_never_becomes_zero(episode, monkeypatch, stage):
    episode.reset()

    def fail(*args, **kwargs):
        raise TimeoutError("sensitive external content")

    if stage == "export":
        monkeypatch.setattr(episode._policy.files, "read", fail)
    else:
        create = module.Sandbox.create

        def create_or_fail(**kwargs):
            if stage == "create":
                return fail()
            verifier = create(**kwargs)
            monkeypatch.setattr(
                verifier.files if stage == "upload" else verifier.commands,
                "write" if stage == "upload" else "run",
                fail,
            )
            return verifier

        monkeypatch.setattr(module.Sandbox, "create", create_or_fail)
    with pytest.raises(
        InfrastructureError, match=r"submission failed \(TimeoutError\)"
    ) as error:
        episode.submit()
    assert "sensitive" not in str(error.value)
    assert episode._reward is None
    with pytest.raises(InfrastructureError):
        episode.get_reward()
    assert not episode._test_owned


def test_verifier_cleanup_failure_retains_id_and_prevents_score(episode, monkeypatch):
    episode.reset()
    episode._test_config["output"] = b'{"north":11,"south":5}'
    kill = module.Sandbox.kill

    def fail_verifier(sandbox_id, **kwargs):
        if sandbox_id.startswith("verifier-"):
            raise OSError("offline")
        return kill(sandbox_id, **kwargs)

    monkeypatch.setattr(module.Sandbox, "kill", fail_verifier)
    with pytest.raises(InfrastructureError, match="Cleanup unresolved: verifier-"):
        episode.submit()
    assert episode._reward is None
    assert episode._owned == episode._test_owned
    assert len(episode._owned) == 1
    monkeypatch.setattr(module.Sandbox, "kill", kill)
    with pytest.raises(InfrastructureError):
        episode.get_reward()
    assert not episode._owned


def test_verifier_info_failure_cleans_id_acquired_before_initialization(
    episode, monkeypatch
):
    episode.reset()
    get_info = module.Sandbox.get_info

    def fail_info(sandbox_id, **kwargs):
        if sandbox_id.startswith("verifier-") and sandbox_id in episode._test_owned:
            raise TimeoutError("initialization response lost")
        return get_info(sandbox_id, **kwargs)

    monkeypatch.setattr(module.Sandbox, "get_info", fail_info)
    with pytest.raises(
        InfrastructureError, match=r"submission failed \(TimeoutError\)"
    ):
        episode.submit()
    assert episode._reward is None
    assert not episode._owned and not episode._test_owned
    assert len(episode._cleanup) == 2
