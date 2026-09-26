# Scoped access to sandbox-hosted MCP tools with Tenuo + E2B (Python)

This example runs three MCP servers inside an E2B sandbox and puts a signed,
task-scoped authorization boundary in front of them with
[Tenuo](https://github.com/tenuo-ai/tenuo). Two servers are E2B's stock
`filesystem` and `fetch`, reached through the MCP gateway. The third is the
**vault**, a small server started inside the sandbox from `vault_server.py`
that holds the one capability that matters, issuing refunds, and verifies
every call's warrant itself before the tool body runs.

That second check is the point of the example. The worker's own client checks
the warrant before a call leaves the process, which stops a prompt-injected
plan. The vault checks it again on arrival, which stops a client that skipped,
forgot, or forged its own check. Both checks run against the same signed
warrant, and only the control plane's root key is trusted.

Three principals are modelled, each with its own key:

| Role | Holds | Does |
|---|---|---|
| Control plane | root key | Mints the task warrant. Signs revocations. The only key the worker and the vault trust. |
| Orchestrator | its own key, the task warrant | Creates the sandbox, starts the vault, grants the worker a narrower warrant, ships it as one string. |
| Worker | its own identity, the warrant stack, the root's public key | Opens a scoped runtime session and calls the sandbox-hosted tools. |

Three enforcement points:

- **Worker side.** Tenuo's MCP client verifies the worker's warrant before
  every scoped call: chain back to the trusted root, proof that the caller
  holds the worker's private key, not expired, not revoked, tool and arguments
  in scope. A denied call never reaches the sandbox.
- **Vault side.** For the vault, the client also attaches the warrant chain
  and a per-call signature over the arguments. `vault_server.py` verifies them
  with `MCPVerifier` against the root key and refuses anything else, with the
  reason returned to the caller.
- **Network.** E2B's egress allowlist is derived from the warrant's fetch host
  as a coarse backstop. It enforces hosts only; a curl probe inside the sandbox
  checks it directly.

The worker's plan is scripted, so the run is deterministic and needs no model
key. Several calls are deliberately hostile: they are what a prompt-injected
agent would try.

## What the demo does

1. Creates a sandbox with the `filesystem` and `fetch` gateway servers and seeds a workspace, including a payments key the worker must never read. Public traffic to the sandbox is disabled, so every sandbox port, the gateway's included, needs the sandbox's traffic token.
2. Installs Tenuo inside the sandbox with uv and starts the vault, passing it the root public key as its only trusted key. The vault is reached over the sandbox's own URL rather than the gateway, because the gateway drops the request `_meta` that carries the warrant.
3. Connects two `SecureMCPClient`s: one to the gateway, one to the vault with `inject_warrant=True`.
4. Control plane mints the task warrant: workspace reads and writes, fetch from `docs.e2b.dev`, and a refund on order A-100 up to 500. Orchestrator grants the worker warrant: read-only, data directory only, same fetch scope, refund on the same order up to 100. Tenuo refuses to construct a child wider than its parent. Both are packed into one warrant-stack string.
5. Warms the gateway servers, then applies the host allowlist: the warrant's fetch host plus the Docker Hub hosts the gateway needs.
6. The worker runs its plan. The in-scope reads, the docs fetch, and the 80 refund succeed. An unlisted argument, the payments key, path traversal, an ungranted write, a post to an outside host, a 250 refund, and a refund on another order are all denied before they leave the process.
7. **A compromised client** disables its local check and calls the vault directly: 250 under the real warrant, 20 with no warrant, and 20 under a warrant minted by an untrusted key. The vault refuses all three and says why.
8. Another identity fails to open a session with the worker's string. The control plane revokes the worker warrant mid-task and the next read is denied.
9. Probes egress from inside the sandbox: the warranted host reachable, `example.com` blocked.
10. Verifies the worker runtime's signed, hash-chained receipts, one per decision, and prints the vault's ledger: exactly one refund, the one the warrant allowed.
11. Kills the sandbox in a `finally` block and exits non-zero if any expectation was not met.

## Setup

```bash
cd examples/tenuo-scoped-mcp-python
cp .env.example .env
# Edit .env with your E2B API key.
set -a
source .env
set +a
```

Install the project and run the offline unit tests. They cover the warrant policy, monotonic attenuation, proof of possession, chain verification, the warrant stack, identity binding, revocation, receipts, egress derivation, and the vault's server-side verification, all without a sandbox.

```bash
uv sync
uv run python -m unittest discover -s tests -v
```

## Run

```bash
uv run python main.py
```

Expected output, abridged:

```
Worker plan, each call checked against the worker warrant before it leaves the process:
  ok     ALLOW list the data directory
  ok     ALLOW read the orders file
  ok     ALLOW read the E2B docs home page
  ok     ALLOW refund 80 on the order, within the worker's limit
  ok     DENY  pass an argument the warrant never mentions
  ok     DENY  read the payments key (in the server's root, outside the warrant)
  ok     DENY  traverse out of the data directory
  ok     DENY  write a file (the worker was never granted writes)
  ok     DENY  post the orders to an outside host
  ok     DENY  refund 250, inside the task's limit but above the worker's
  ok     DENY  refund a different order

A compromised client skips its own check and talks to the vault directly:
  ok     DENY  refund 250 with a valid warrant that does not cover it
           Constraint 'amount' not satisfied: value does not match constraint
  ok     DENY  refund 20 with no warrant at all
           No warrant provided. ...
  ok     DENY  refund 20 under a warrant minted by an untrusted key
           Root warrant issuer is not trusted

Another identity tries to use the worker's warrant string:
  ok     DENY  open a session with a borrowed warrant

The control plane revokes the worker warrant mid-task:
  ok     DENY  read after revocation
           RevokedError: Warrant 'tnu_wrt_...' has been revoked

Checking the sandbox egress policy directly:
  ok     docs.e2b.dev reachable; example.com blocked (curl exit 35)

Signed receipts collected by the worker runtime: 12
  allow filesystem-list_directory    -                      first
  ...
  deny  filesystem-read_file         warrant-revoked        chained

Vault ledger (what actually moved): [{'order_id': 'A-100', 'amount': 80, 'warrant': 'tnu_wrt_...'}]

Every out-of-scope call was denied by the worker's own check, and the vault refused every call that bypassed it. One refund moved, and it is the one the warrant allowed.
```

A full run takes under a minute; installing Tenuo inside the sandbox is most of it.

## The practices this example follows

- **One key per principal.** The worker is a `HolderIdentity`; the root and orchestrator are `SigningKey`s. The demo generates all three in one process for readability. In production, load the worker's identity with `HolderIdentity.load_or_create(path)`, keep the other private keys in their owning services, and give the worker and the vault only the root's public key.
- **Delegated authority travels as a string, private keys do not.** `pack_for_worker()` encodes the task and worker warrants as one warrant stack. `Runtime.session_from_wire()` decodes it, checks that the leaf names the worker as holder, and binds it to the worker's key.
- **Verify on both ends, against a root.** The worker's `Runtime` and the vault's `MCPVerifier` both trust the control plane's key only. A leaf without its chain, a chain that ends elsewhere, or a signature by the wrong key is denied on either side.
- **Delegate down, never sideways or up.** The orchestrator's grant is narrower than the task on every axis; Tenuo enforces that at grant time.
- **Constrain every argument you intend to allow.** Arguments a warrant does not mention are rejected, not ignored.
- **Verify the wire arguments.** The vault verifies the raw arguments the client signed, not a coerced copy, so the proof of possession covers exactly what was asked for.
- **Short TTLs, minted per task.** Fifteen minutes for the task, five for the worker. Revocation is the backstop, not the primary control.
- **Revocation is signed by the root.** A list signed by anyone else is rejected and the verifier fails closed. In production the worker and the vault fetch the current list from the control plane.
- **Keep signed evidence.** `Runtime(receipts="collect")` records every worker-side decision, signed and hash-chained. The demo verifies the count, every signature, and every chain link before acknowledging.
- **Derive a coarse network backstop from the warrant.** `egress_rules()` reads the fetch host from the worker warrant and turns it into E2B `allow_out` and `deny_out` lists.

## Trust boundary

The threat is a prompt-injected or mistaken worker plan, and beyond that a
worker process that has been tampered with so its own checks no longer run.
The first is stopped by the worker's `SecureMCPClient`. The second is stopped
by the vault, which is the only place the refund can actually happen and which
does not trust the caller.

The stock `filesystem` and `fetch` servers are not Tenuo-aware; for them the
worker-side check is the only check, as with any MCP server you do not
control. The pattern for your own tools is the vault: verify on arrival.

The demo keeps the control plane, orchestrator, and worker in one Python
process. It models their delegation relationship but does not isolate them
from each other. The E2B network policy is defense in depth for outbound
connections from inside the sandbox; it does not replace warrant verification.

## Notes

- The vault is started as a process in the sandbox and reached over `https://<port>-<sandbox>.e2b.app` with the `e2b-traffic-access-token` header, because E2B's MCP gateway forwards tool arguments but not the request `_meta` that Tenuo's warrant envelope rides in (reported as [e2b-dev/E2B#1900](https://github.com/e2b-dev/E2B/issues/1900)). The gateway is used for the stock servers only. Tenuo 0.3.1 adds `SecureMCPClient(inject_warrant="argument")`, which carries the envelope in a reserved tool argument for exactly this kind of gateway; it currently needs a low-level `tools/call` handler on the server, so this example keeps the vault direct and self-contained.
- E2B's gateway template ships Python 3.8, so the vault gets its own Python 3.12 from uv. Tenuo 0.3.1's Linux wheel targets glibc 2.28 and installs on the sandbox's Ubuntu 20.04; earlier wheels do not.
- Domain-based egress allowlists on E2B require a catch-all `deny_out`. The Docker Hub hosts in `GATEWAY_HOSTS` stay allowed because the gateway re-validates each server's pinned image when it opens a session.
- Lock egress only after the gateway servers have handled one call each and the vault's dependencies are installed.
- The demo lowers Tenuo's log level because it prints each expected check. In production keep the `tenuo` logger at `WARNING`.
- Replacing the scripted plan with a model is a matter of turning its tool calls into `client.tools[name](**args)` calls inside the same `session_scope`. Neither boundary changes.
- Tenuo's MCP integration guide: https://tenuo.ai/mcp. Source and issues: https://github.com/tenuo-ai/tenuo.
