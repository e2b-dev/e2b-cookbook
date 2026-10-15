"""Warrant policy for a worker calling sandbox-hosted tools.

Three principals are modelled, each with its own key:

- The control plane holds the root key. It mints the task warrant and is the
  only signer of revocation lists. Every verifier trusts this key and no other.
- The orchestrator holds its own key and the task warrant. It grants a narrower
  warrant to the worker and ships it as one base64 string: the warrant stack.
- The worker uses its own identity, the delegated warrant stack, and the
  trusted root's public key.

For readability this demo keeps all three principals in one Python process;
production deployments should separate them so the worker cannot access the
root or orchestrator private keys.

Everything the worker may request through the secure MCP client is written
down in the worker warrant. The sandbox's coarser host-level egress allowlist
uses the fetch constraint from that warrant and adds hosts required by E2B's
MCP gateway.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from tenuo import (
    Exact,
    PublicKey,
    Range,
    SignedRevocationList,
    SigningKey,
    Subpath,
    UrlPattern,
    Warrant,
    encode_warrant_stack,
)

WORKSPACE = "/home/user/workspace"
DATA_DIR = f"{WORKSPACE}/data"
DOCS_SITE = "https://docs.e2b.dev/*"

# The vault runs inside the sandbox and verifies warrants itself. Its tool is
# reached directly, not through the gateway, so its name carries no prefix.
VAULT_TOOL = "issue_refund"
ORDER_ID = "A-100"
TASK_REFUND_LIMIT = 500
WORKER_REFUND_LIMIT = 100

# E2B's MCP gateway runs each server as a container and re-validates the pinned
# image against Docker Hub whenever it opens a session. Those hosts have to stay
# reachable after the sandbox is locked down, or every tool call fails with
# "failed to pull image". They are the gateway's dependency, not the worker's:
# the warrant still denies any fetch to them at the tool layer.
GATEWAY_HOSTS = [
    "registry-1.docker.io",
    "auth.docker.io",
    "index.docker.io",
    "production.cloudflare.docker.com",
]


@dataclass(frozen=True)
class ToolNames:
    """The gateway's names for the four tools this example uses."""

    read_file: str
    list_directory: str
    write_file: str
    fetch: str


WANTED = ("read_file", "list_directory", "write_file", "fetch")


def resolve_tool_names(available: Iterable[str]) -> ToolNames:
    """Map the tools this example needs onto what the MCP gateway advertises.

    E2B's gateway prefixes each tool with its server name, as in
    ``filesystem-read_file`` and ``fetch-fetch``. Accept an exact match first and
    a namespaced suffix second, and fail loudly on anything ambiguous: a warrant
    must name the tool exactly as the gateway will see it called.
    """
    names = list(available)
    found: dict[str, str] = {}
    for wanted in WANTED:
        exact = [n for n in names if n == wanted]
        separators = ("-" + wanted, "_" + wanted, "." + wanted, "/" + wanted)
        namespaced = [n for n in names if n.endswith(separators)]
        candidates = exact or namespaced
        if len(candidates) != 1:
            raise LookupError(
                f"expected exactly one gateway tool for {wanted!r}, found {candidates or names}"
            )
        found[wanted] = candidates[0]
    return ToolNames(**found)


# --- control plane -----------------------------------------------------------


def mint_task_warrant(
    root: SigningKey, orchestrator: PublicKey, tools: ToolNames, ttl: int = 900
) -> Warrant:
    """The whole task's authority: workspace reads and writes, the E2B docs, and a
    refund on one order up to the task limit.

    Minted per task with a TTL in minutes. Nothing in this example holds
    authority for longer than the task it was minted for.
    """
    return (
        Warrant.mint_builder()
        .capability(tools.read_file, path=Subpath(WORKSPACE))
        .capability(tools.list_directory, path=Subpath(WORKSPACE))
        .capability(tools.write_file, path=Subpath(WORKSPACE))
        .capability(tools.fetch, url=UrlPattern(DOCS_SITE))
        .capability(VAULT_TOOL, order_id=Exact(ORDER_ID), amount=Range.max_value(TASK_REFUND_LIMIT))
        .holder(orchestrator)
        .ttl(ttl)
        .mint(root)
    )


def revocation_list(root: SigningKey, warrant_id: str) -> bytes:
    """A signed revocation list naming one warrant, ready to send to every verifier.

    Only a trusted root may sign a revocation list. A list signed by anyone
    else is rejected, and a verifier holding an untrusted list fails closed.
    """
    builder = SignedRevocationList.builder()
    builder.revoke(warrant_id)
    return builder.build(root).to_bytes()


# --- orchestrator ------------------------------------------------------------


def grant_worker_warrant(
    task: Warrant,
    orchestrator_key: SigningKey,
    worker: PublicKey,
    tools: ToolNames,
    ttl: int = 300,
) -> Warrant:
    """Narrow the task for one worker: read-only, the data directory only, same fetch
    scope, and a refund on the same order at a fifth of the task's limit.

    The grant is signed by the orchestrator, names the worker's public key as the
    holder, and cannot be wider than the task warrant. Tenuo refuses to construct
    a child that adds a tool, loosens a path, or outlives its parent.
    """
    return (
        task.grant_builder()
        .holder(worker)
        .capability(tools.read_file, path=Subpath(DATA_DIR))
        .capability(tools.list_directory, path=Subpath(DATA_DIR))
        .capability(tools.fetch, url=UrlPattern(DOCS_SITE))
        .capability(VAULT_TOOL, order_id=Exact(ORDER_ID), amount=Range.max_value(WORKER_REFUND_LIMIT))
        .ttl(ttl)
        .grant(orchestrator_key)
    )


def pack_for_worker(task: Warrant, worker: Warrant) -> str:
    """The one string the worker receives: its warrant plus the chain back to the root.

    A leaf warrant alone cannot be verified, because the verifier has to walk
    hash-linked parents back to a trusted root. Shipping the stack keeps that
    chain with the leaf wherever it travels.
    """
    return encode_warrant_stack([task, worker])


def egress_hosts(warrant: Warrant, fetch_tool: str) -> list[str]:
    """Extract the permitted fetch hosts for a coarse network backstop."""
    constraints = warrant.capabilities.get(fetch_tool, {})
    url_pattern = constraints.get("url")
    if url_pattern is None:
        return []
    return [url_pattern.host_pattern]


def egress_rules(warrant: Warrant, fetch_tool: str) -> dict[str, list[str]]:
    """E2B network rules for a sandbox that runs under this warrant.

    Domain allowlists require a catch-all deny, per E2B's internet-access docs.
    A warrant with no fetch capability leaves only the gateway's own hosts open.
    These rules enforce hosts only. Tool, path, argument, identity, expiry, and
    revocation checks remain the responsibility of warrant verification.
    """
    return {
        "allow_out": egress_hosts(warrant, fetch_tool) + GATEWAY_HOSTS,
        "deny_out": ["0.0.0.0/0"],
    }
