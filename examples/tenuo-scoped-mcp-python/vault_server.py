"""The vault: an MCP server that verifies Tenuo warrants itself before acting.

This file runs *inside* the E2B sandbox as a streamable-HTTP MCP server. It
holds the one capability that matters, issuing refunds, and it does not trust
the caller. Every call must carry a warrant chain that leads back to the
control plane's root key, signed by the holder of that warrant, with the tool
and arguments inside scope. The check happens here, in the tool, so a client
that skipped or forged its own checks gains nothing.

Started by main.py with:

    python3 vault_server.py --trusted-root <root public key, hex> --port 8765

Dependencies inside the sandbox: tenuo[mcp] (verifier + MCP SDK).
"""

from __future__ import annotations

import argparse
import sys

from mcp.server.mcpserver import Context, MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from tenuo import Authorizer, PublicKey
from tenuo.mcp import MCPVerifier

parser = argparse.ArgumentParser()
parser.add_argument(
    "--trusted-root", required=True, help="hex public key of the control plane"
)
parser.add_argument("--port", type=int, default=8765)
args = parser.parse_args()

# The only key this server trusts. Warrants minted by anyone else, or chains
# that do not end at this key, are rejected before the tool body runs.
verifier = MCPVerifier(
    authorizer=Authorizer(
        trusted_roots=[PublicKey.from_bytes(bytes.fromhex(args.trusted_root))]
    )
)

mcp = MCPServer("vault")
LEDGER: list[dict[str, float | str]] = []


@mcp.tool()
def issue_refund(order_id: str, amount: int | float, ctx: Context) -> str:
    """Refund an amount on an order. Requires a Tenuo warrant that covers this exact call."""
    request = ctx.request_context
    # Verify the raw wire arguments: the proof of possession was computed over
    # them by the caller, so a coerced or reordered copy would not verify.
    raw_arguments = dict(
        getattr(request.params, "arguments", None)
        or {"order_id": order_id, "amount": amount}
    )
    result = verifier.verify(
        "issue_refund", raw_arguments, meta=getattr(request, "meta", None)
    )
    if not result.allowed:
        # ToolError returns the message to the caller as an error result, so the
        # client sees exactly why the vault refused, without a server traceback.
        raise ToolError(f"vault refused: {result.denial_reason}")
    LEDGER.append(
        {"order_id": order_id, "amount": amount, "warrant": result.warrant_id or ""}
    )
    return f"refunded {amount:.2f} on {order_id}"


@mcp.tool()
def ledger() -> str:
    """List the refunds this vault has issued. Read-only, no warrant required."""
    return repr(LEDGER)


if __name__ == "__main__":
    print(
        f"vault listening on :{args.port}, trusting root {args.trusted_root[:12]}...",
        file=sys.stderr,
    )
    mcp.run(transport="streamable-http", host="0.0.0.0", port=args.port)
