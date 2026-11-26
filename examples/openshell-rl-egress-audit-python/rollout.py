"""One rollout: run a policy in a fresh sandbox, grade the result elsewhere.

Two backends share the task, the grader and the receipt:

- "plain": one E2B sandbox whose egress is limited to PyPI by host name.
- "openshell": one OpenShell sandbox on E2B (a worker VM with no egress plus a
  supervisor VM that enforces the policy), created through an openshell-e2b
  gateway. PyPI is read-only and the paths of the package under repair are
  denied. Denied requests are read back from the sandbox's OpenShell log.
"""

from __future__ import annotations

import io
import os
import re
import secrets
import shlex
import tarfile
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

from e2b import CommandExitException, FileNotFoundException, Sandbox, SandboxQuery

from task import HIDDEN_TEST, SOLUTION_FILE, WORKDIR, Policy, buggy_package, workspace_files

LABEL = "openshell-rl-run"  # E2B metadata / OpenShell label carrying the run id
MAX_SOLUTION_BYTES = 256 * 1024
COMMAND_TIMEOUT_S = 120
LOG_SETTLE_S = 5  # supervisor log push is asynchronous; wait before reading

# Plain E2B: egress allowed to PyPI's two hosts, everything else denied.
PLAIN_NETWORK = {
    "allow_out": ["pypi.org", "files.pythonhosted.org"],
    "deny_out": ["0.0.0.0/0"],
}

# OpenShell: same two hosts, read-only, minus the package under repair.
# PyPI answers case variants and a missing slash with a 301 to /simple/cachetools/.
PYPI_DENY_PATHS = ("/simple/cachetools", "/simple/cachetools/**", "/pypi/cachetools/**")
FILES_DENY_PATHS = ("/packages/**/cachetools-*",)
# pip is a Python script, so OpenShell sees the interpreter. List its real
# path (python3 is a symlink to it in the E2B base image).
PYTHON = "/usr/local/bin/python3.11"

DENIED = re.compile(r"^(NET|HTTP):\S+ \[[A-Z]+\] DENIED ")


@dataclass
class Step:
    command: str
    exit_code: int
    output_tail: str


@dataclass
class RolloutResult:
    policy: str
    backend: str
    reward: float
    flagged: bool
    use_for_training: bool
    denied_attempts: list[str] | None  # None: this backend keeps no per-request record
    audit_delivery: str
    rollout_sandbox: str
    verifier_sandbox: str | None
    steps: list[Step] = field(default_factory=list)

    def to_json(self) -> dict:
        return asdict(self)


def denied_lines(log_lines) -> list[str]:
    """Raw OpenShell denial lines from GetSandboxLogs results.

    OCSF events arrive with level "OCSF" and their one-line shorthand as the
    message. Delivery is best-effort: an empty list means none observed.
    """
    return [
        line.message for line in log_lines if line.level == "OCSF" and DENIED.match(line.message)
    ]


def verdict(backend: str, denials: list[str] | None) -> dict:
    """The caller's training decision. Reward stays the hidden-test result."""
    if backend == "plain":
        return {
            "flagged": False,
            "use_for_training": True,
            "denied_attempts": None,
            "audit_delivery": "none (host allow-list keeps no per-request record)",
        }
    flagged = bool(denials)
    return {
        "flagged": flagged,
        "use_for_training": not flagged,
        "denied_attempts": list(denials or []),
        "audit_delivery": "best_effort",
    }


def _tail(text: str, limit: int = 400) -> str:
    return text[-limit:]


def _plain_step(sbx: Sandbox, command: str) -> Step:
    # `timeout` stops a hung command inside the sandbox and turns it into exit 137,
    # a failure the policy observes like any other. The SDK timeout only backs it up.
    wrapped = f"timeout -s KILL {COMMAND_TIMEOUT_S} bash -c {shlex.quote(command)}"
    try:
        r = sbx.commands.run(wrapped, cwd=WORKDIR, timeout=COMMAND_TIMEOUT_S + 30)
        return Step(command, r.exit_code, _tail(r.stdout + r.stderr))
    except CommandExitException as e:  # the policy observes failures and goes on
        return Step(command, e.exit_code, _tail(e.stdout + e.stderr))


def run_plain(policy: Policy, run_id: str) -> tuple[str, list[Step], str | None]:
    sbx = Sandbox.create(timeout=600, metadata={LABEL: run_id}, network=PLAIN_NETWORK)
    try:
        for path, text in workspace_files().items():
            sbx.files.write(f"{WORKDIR}/{path}", text)
        steps = [_plain_step(sbx, c) for c in policy.commands]
        try:
            data = b""  # stop at the cap, as the openshell backend's `head -c` does
            with sbx.files.read(f"{WORKDIR}/{SOLUTION_FILE}", format="stream") as stream:
                for chunk in stream:
                    data += chunk
                    if len(data) > MAX_SOLUTION_BYTES:
                        break
            candidate = data.decode(errors="replace")  # never shorter than `data` once encoded
        except FileNotFoundException:  # the policy deleted it: nothing to grade
            candidate = None
        return sbx.sandbox_id, steps, candidate
    finally:
        sbx.kill()


@dataclass(frozen=True)
class Gateway:
    """An openshell-e2b gateway reached through `npm run connect`'s local tunnel."""

    endpoint: str
    tls_dir: Path  # holds ca.crt, tls.crt and tls.key written by `npm run connect`
    workspace: str = "default"

    @classmethod
    def from_env(cls) -> Gateway:
        tls_dir = os.environ.get("OPENSHELL_TLS_DIR")
        if not tls_dir:
            raise SystemExit("set OPENSHELL_TLS_DIR (see README: Part 2)")
        return cls(
            endpoint=os.environ.get("OPENSHELL_GATEWAY", "127.0.0.1:17691"),
            tls_dir=Path(tls_dir).expanduser(),
        )

    def connect(self):
        import grpc
        from openshell import SandboxClient, TlsConfig
        from openshell._proto import openshell_pb2_grpc

        ca, cert, key = (self.tls_dir / n for n in ("ca.crt", "tls.crt", "tls.key"))
        client = SandboxClient(
            self.endpoint, tls=TlsConfig(ca_path=ca, cert_path=cert, key_path=key)
        )
        # The SDK has no log reader; its generated stubs are the documented way in.
        channel = grpc.secure_channel(
            self.endpoint,
            grpc.ssl_channel_credentials(ca.read_bytes(), key.read_bytes(), cert.read_bytes()),
        )
        return client, openshell_pb2_grpc.OpenShellStub(channel), channel


def sandbox_policy():
    """PyPI read-only for the Python interpreter, minus cachetools; nothing else."""
    from openshell._proto import sandbox_pb2 as pb

    def endpoint(host: str, deny_paths: tuple[str, ...]):
        return pb.NetworkEndpoint(
            host=host,
            port=443,
            protocol="rest",
            enforcement=pb.NETWORK_ENFORCEMENT_MODE_ENFORCE,  # the default is audit-only
            access=pb.NETWORK_ACCESS_PRESET_READ_ONLY,
            deny_rules=[pb.L7DenyRule(method="*", path=p) for p in deny_paths],
        )

    return pb.SandboxPolicy(
        version=1,
        # OpenShell's documented default filesystem access, stated explicitly.
        filesystem=pb.FilesystemPolicy(
            include_workdir=True,
            read_only=["/bin", "/usr", "/lib", "/proc", "/dev/urandom", "/etc", "/var/log"],
            read_write=["/tmp", "/dev/null"],
        ),
        landlock=pb.LandlockPolicy(compatibility="best_effort"),
        network_policies={
            "pypi": pb.NetworkPolicyRule(
                name="pypi",
                endpoints=[
                    endpoint("pypi.org", PYPI_DENY_PATHS),
                    endpoint("files.pythonhosted.org", FILES_DENY_PATHS),
                ],
                binaries=[pb.NetworkBinary(path=PYTHON)],
            )
        },
    )


def _tar(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for path, text in files.items():
            data = text.encode()
            info = tarfile.TarInfo(path)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def run_openshell(
    policy: Policy, run_id: str, gw: Gateway
) -> tuple[str, list[Step], str | None, list[str]]:
    from openshell._proto import datamodel_pb2, openshell_pb2

    client, stub, channel = gw.connect()
    # Unique per rollout, so parallel rollouts never share (or delete) a sandbox.
    # OpenShell names are at most 19 chars; the run id goes in the label.
    name = f"rl-{secrets.token_hex(6)}"
    ws = gw.workspace

    def sh(command: str, **kw):
        return client.exec(name, ["sh", "-c", command], workspace=ws, workdir=WORKDIR, **kw)

    try:
        client.create(
            workspace=ws,
            spec=openshell_pb2.SandboxSpec(policy=sandbox_policy()),
            name=name,
            labels={LABEL: run_id},
        )
        client.wait_ready(name, workspace=ws, timeout_seconds=300)
        # No file API in the SDK: stream a tar through exec stdin.
        upload = client.exec(
            name,
            ["sh", "-c", f"mkdir -p {WORKDIR} && tar -x -C {WORKDIR}"],
            workspace=ws,
            stdin=_tar(workspace_files()),
            timeout_seconds=60,
        )
        if upload.exit_code != 0:
            raise RuntimeError(f"workspace upload failed: {upload.stderr[-300:]}")
        steps = []
        for command in policy.commands:
            r = sh(command, timeout_seconds=COMMAND_TIMEOUT_S)
            steps.append(Step(command, r.exit_code, _tail(r.stdout + r.stderr)))
        out = sh(f"head -c {MAX_SOLUTION_BYTES + 1} {SOLUTION_FILE}", timeout_seconds=30)
        candidate = out.stdout if out.exit_code == 0 else None
        time.sleep(LOG_SETTLE_S)
        logs = stub.GetSandboxLogs(
            openshell_pb2.GetSandboxLogsRequest(
                workspace_scope=datamodel_pb2.WorkspaceSelector(workspace=ws),
                sandbox=name,
                sources=["sandbox"],
            ),
            timeout=30,
        )
        return name, steps, candidate, denied_lines(logs.logs)
    finally:
        try:
            client.delete(name, workspace=ws, allow_missing=True)
            client.wait_deleted(name, workspace=ws, timeout_seconds=120)
        finally:
            channel.close()
            client.close()


def grade(candidate: str | None, run_id: str) -> tuple[float, str | None]:
    """Run the hidden test in a fresh, offline E2B sandbox; the host decides."""
    if candidate is None or len(candidate.encode()) > MAX_SOLUTION_BYTES:
        return 0.0, None
    nonce = secrets.token_hex(8)
    sbx = Sandbox.create(timeout=180, metadata={LABEL: run_id}, allow_internet_access=False)
    try:
        files = {**buggy_package(), SOLUTION_FILE: candidate, "hidden_test.py": HIDDEN_TEST}
        for path, text in files.items():
            sbx.files.write(f"/tmp/grade/{path}", text)
        try:
            r = sbx.commands.run(
                f"timeout -s KILL 30 python3 hidden_test.py {nonce}", cwd="/tmp/grade", timeout=60
            )
        except CommandExitException:
            return 0.0, sbx.sandbox_id
        return (1.0 if passed(r.stdout, nonce) else 0.0), sbx.sandbox_id
    finally:
        sbx.kill()


def passed(stdout: str, nonce: str) -> bool:
    """The hidden test ran to its end: its last line is this run's nonce."""
    lines = stdout.strip().splitlines()
    return bool(lines) and lines[-1] == nonce


def rollout(policy: Policy, backend: str, run_id: str, gw: Gateway | None = None) -> RolloutResult:
    if backend == "plain":
        rollout_sandbox, steps, candidate = run_plain(policy, run_id)
        denials = None
    else:
        rollout_sandbox, steps, candidate, denials = run_openshell(policy, run_id, gw)
    reward, verifier = grade(candidate, run_id)
    return RolloutResult(
        policy=policy.name,
        backend=backend,
        reward=reward,
        rollout_sandbox=rollout_sandbox,
        verifier_sandbox=verifier,
        steps=steps,
        **verdict(backend, denials),
    )


def sandboxes_left(run_id: str, gw: Gateway | None = None) -> int:
    """Sandboxes this run created that still exist (E2B sandboxes + OpenShell sandboxes)."""
    left = len(Sandbox.list(query=SandboxQuery(metadata={LABEL: run_id})).next_items())
    if gw is not None:
        client, _, channel = gw.connect()
        try:
            left += len(
                client.list(workspace=gw.workspace, label_selector=f"{LABEL}={run_id}").all()
            )
        finally:
            channel.close()
            client.close()
    return left
