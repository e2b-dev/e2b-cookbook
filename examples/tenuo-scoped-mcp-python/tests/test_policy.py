"""Offline checks for the warrant policy. No sandbox, no network, no API key."""

import hashlib
import unittest

from policy import (
    DATA_DIR,
    GATEWAY_HOSTS,
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
    BoundWarrant,
    ConfigurationError,
    HolderIdentity,
    Runtime,
    SignedRevocationList,
    SigningKey,
    TenuoError,
    UrlPattern,
)
from tenuo import enforce_tool_call

TOOLS = ToolNames(
    read_file="read_file",
    list_directory="list_directory",
    write_file="write_file",
    fetch="fetch",
)


class PolicyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.root = SigningKey.generate()
        self.orchestrator = SigningKey.generate()
        self.worker = SigningKey.generate()
        self.task = mint_task_warrant(self.root, self.orchestrator.public_key, TOOLS)
        self.child = grant_worker_warrant(
            self.task, self.orchestrator, self.worker.public_key, TOOLS
        )

    def decide(self, tool, args, key=None, chain=True):
        bound = BoundWarrant(self.child, key or self.worker)
        result = enforce_tool_call(
            tool,
            args,
            bound,
            trusted_roots=[self.root.public_key],
            warrant_chain=[self.task] if chain else [],
        )
        return result.allowed, result.denial_reason or ""

    def test_worker_is_read_only_inside_the_data_directory(self):
        self.assertTrue(self.decide("read_file", {"path": f"{DATA_DIR}/orders.csv"})[0])
        self.assertTrue(self.decide("list_directory", {"path": DATA_DIR})[0])
        self.assertFalse(
            self.decide("write_file", {"path": f"{DATA_DIR}/x", "content": ""})[0]
        )

    def test_paths_outside_the_data_directory_are_denied_even_inside_the_workspace(
        self,
    ):
        allowed, reason = self.decide(
            "read_file", {"path": f"{WORKSPACE}/config/api_keys.txt"}
        )
        self.assertFalse(allowed, reason)
        allowed, _ = self.decide(
            "read_file", {"path": f"{DATA_DIR}/../config/api_keys.txt"}
        )
        self.assertFalse(allowed)

    def test_fetch_is_limited_to_the_docs_site(self):
        self.assertTrue(self.decide("fetch", {"url": "https://docs.e2b.dev/"})[0])
        self.assertFalse(
            self.decide("fetch", {"url": "https://example.com/collect"})[0]
        )
        self.assertFalse(self.decide("fetch", {"url": "http://docs.e2b.dev/"})[0])

    def test_a_copied_warrant_is_useless_without_the_holders_key(self):
        stranger = SigningKey.generate()
        allowed, reason = self.decide(
            "read_file", {"path": f"{DATA_DIR}/orders.csv"}, key=stranger
        )
        self.assertFalse(allowed)
        self.assertIn("Proof-of-Possession", reason)

    def test_a_child_presented_without_its_chain_is_denied(self):
        allowed, reason = self.decide(
            "read_file", {"path": f"{DATA_DIR}/orders.csv"}, chain=False
        )
        self.assertFalse(allowed)
        self.assertIn("not trusted", reason)

    def test_the_orchestrator_cannot_widen_the_task(self):
        with self.assertRaises(TenuoError):
            self.task.grant(
                to=self.worker.public_key,
                allow="fetch",
                url=UrlPattern("https://*/*"),
                ttl=60,
                key=self.orchestrator,
            )
        with self.assertRaises(TenuoError):
            # Signed by a key that does not hold the task warrant.
            self.task.grant(
                to=self.worker.public_key, allow="read_file", ttl=60, key=self.worker
            )

    def test_egress_rules_follow_the_warrant(self):
        rules = egress_rules(self.child, "fetch")
        self.assertEqual(rules["allow_out"], ["docs.e2b.dev"] + GATEWAY_HOSTS)
        self.assertEqual(rules["deny_out"], ["0.0.0.0/0"])
        offline = egress_rules(self.child, "no_such_tool")
        self.assertEqual(offline["allow_out"], GATEWAY_HOSTS)


class WorkerRuntimeTest(unittest.TestCase):
    """The worker holds one identity and receives one string; everything else is derived."""

    def setUp(self) -> None:
        self.root = SigningKey.generate()
        self.orchestrator = SigningKey.generate()
        self.worker = HolderIdentity.generate()
        self.task = mint_task_warrant(self.root, self.orchestrator.public_key, TOOLS)
        self.child = grant_worker_warrant(
            self.task, self.orchestrator, self.worker.public_key, TOOLS
        )
        self.stack = pack_for_worker(self.task, self.child)

    def decide_in_session(self, runtime, tool, args):
        session = runtime.session_from_wire(self.stack)
        with runtime.session_scope(session):
            result = enforce_tool_call(tool, args, session.bound)
        return result.allowed, result.denial_reason or ""

    def test_the_stack_carries_the_chain_and_the_worker_can_open_it(self):
        runtime = Runtime(self.worker, trusted_roots=[self.root.public_key])
        session = runtime.session_from_wire(self.stack)
        self.assertEqual(len(session._parents), 1)
        self.assertEqual(session.warrant.id, self.child.id)
        self.assertTrue(
            self.decide_in_session(
                runtime, "read_file", {"path": f"{DATA_DIR}/orders.csv"}
            )[0]
        )

    def test_another_identity_cannot_open_a_session_with_the_workers_stack(self):
        intern = Runtime(
            HolderIdentity.generate(), trusted_roots=[self.root.public_key]
        )
        with self.assertRaises(ConfigurationError):
            intern.session_from_wire(self.stack)

    def test_a_root_signed_revocation_denies_the_worker(self):
        runtime = Runtime(self.worker, trusted_roots=[self.root.public_key])
        wire = revocation_list(self.root, self.child.id)
        runtime.apply_revocation_list(SignedRevocationList.from_bytes(wire))
        allowed, reason = self.decide_in_session(
            runtime, "read_file", {"path": f"{DATA_DIR}/orders.csv"}
        )
        self.assertFalse(allowed)
        self.assertIn("revoked", reason)

    def test_a_revocation_signed_by_the_orchestrator_is_not_honoured_and_fails_closed(
        self,
    ):
        runtime = Runtime(self.worker, trusted_roots=[self.root.public_key])
        runtime.apply_revocation_list(
            SignedRevocationList.from_bytes(
                revocation_list(self.orchestrator, self.child.id)
            )
        )
        allowed, reason = self.decide_in_session(
            runtime, "read_file", {"path": f"{DATA_DIR}/orders.csv"}
        )
        self.assertFalse(allowed)
        self.assertIn("not a trusted root", reason)

    def test_receipts_are_signed_by_the_worker_and_chained(self):
        from tenuo_core import verify_receipt

        runtime = Runtime(
            self.worker, trusted_roots=[self.root.public_key], receipts="collect"
        )
        session = runtime.session_from_wire(self.stack)
        with runtime.session_scope(session):
            # enforce_tool_call hands its result to the Runtime in scope; nothing to collect by hand.
            for path in (f"{DATA_DIR}/orders.csv", f"{WORKSPACE}/config/api_keys.txt"):
                enforce_tool_call("read_file", {"path": path}, session.bound)
        receipts = runtime.drain_receipts()
        payloads = [verify_receipt(wire) for wire in receipts]
        self.assertEqual([p.outcome for p in payloads], ["allow", "deny"])
        self.assertEqual(
            {p.signer_key for p in payloads}, {self.worker.public_key.to_bytes().hex()}
        )
        self.assertIsNone(payloads[0].prev_receipt_hash)
        self.assertEqual(
            payloads[1].prev_receipt_hash,
            hashlib.sha256(bytes.fromhex(receipts[0])).hexdigest(),
        )


class ToolNameResolutionTest(unittest.TestCase):
    def test_exact_names_win(self):
        names = [
            "read_file",
            "read_text_file",
            "list_directory",
            "list_directory_with_sizes",
            "write_file",
            "fetch",
        ]
        self.assertEqual(resolve_tool_names(names), TOOLS)

    def test_namespaced_names_are_accepted(self):
        # The names E2B's gateway actually advertises.
        names = [
            "fetch-fetch",
            "filesystem-create_directory",
            "filesystem-directory_tree",
            "filesystem-edit_file",
            "filesystem-list_allowed_directories",
            "filesystem-list_directory",
            "filesystem-move_file",
            "filesystem-read_file",
            "filesystem-read_multiple_files",
            "filesystem-search_files",
            "filesystem-write_file",
        ]
        resolved = resolve_tool_names(names)
        self.assertEqual(resolved.read_file, "filesystem-read_file")
        self.assertEqual(resolved.list_directory, "filesystem-list_directory")
        self.assertEqual(resolved.write_file, "filesystem-write_file")
        self.assertEqual(resolved.fetch, "fetch-fetch")

    def test_missing_or_ambiguous_names_fail_loudly(self):
        with self.assertRaises(LookupError):
            resolve_tool_names(
                ["read_file", "list_directory", "write_file"]
            )  # no fetch
        with self.assertRaises(LookupError):
            resolve_tool_names(
                ["a_fetch", "b_fetch", "read_file", "list_directory", "write_file"]
            )


if __name__ == "__main__":
    unittest.main()


class VaultVerificationTest(unittest.TestCase):
    """What the vault does with a call, using the same verifier vault_server.py builds.

    The envelope is built by hand here the way SecureMCPClient(inject_warrant=True)
    builds it on the wire: the warrant stack plus a proof-of-possession
    signature over the raw arguments. No sandbox, no network.
    """

    def setUp(self) -> None:
        import base64
        import time

        from tenuo import Authorizer, encode_warrant_stack
        from tenuo.mcp import MCPVerifier

        self.root = SigningKey.generate()
        self.orchestrator = SigningKey.generate()
        self.worker = HolderIdentity.generate()
        self.task = mint_task_warrant(self.root, self.orchestrator.public_key, TOOLS)
        self.child = grant_worker_warrant(
            self.task, self.orchestrator, self.worker.public_key, TOOLS
        )
        self.verifier = MCPVerifier(
            authorizer=Authorizer(trusted_roots=[self.root.public_key])
        )

        def envelope(leaf, parents, key, args):
            signature = leaf.sign(key.signing_key, VAULT_TOOL, args, int(time.time()))
            return {
                "tenuo": {
                    "warrant": encode_warrant_stack(list(parents) + [leaf]),
                    "signature": base64.b64encode(bytes(signature)).decode(),
                }
            }

        self.envelope = envelope

    def test_in_scope_call_with_the_worker_chain_is_allowed(self):
        args = {"order_id": ORDER_ID, "amount": 80}
        meta = self.envelope(self.child, [self.task], self.worker, args)
        result = self.verifier.verify(VAULT_TOOL, args, meta=meta)
        self.assertTrue(result.allowed, result.denial_reason)
        self.assertEqual(result.warrant_id, self.child.id)

    def test_over_the_workers_limit_is_refused_even_inside_the_tasks_limit(self):
        args = {"order_id": ORDER_ID, "amount": 250}
        meta = self.envelope(self.child, [self.task], self.worker, args)
        result = self.verifier.verify(VAULT_TOOL, args, meta=meta)
        self.assertFalse(result.allowed)
        self.assertIn("amount", result.denial_reason)

    def test_no_envelope_is_refused(self):
        result = self.verifier.verify(VAULT_TOOL, {"order_id": ORDER_ID, "amount": 20}, meta=None)
        self.assertFalse(result.allowed)
        self.assertIn("No warrant", result.denial_reason)

    def test_a_warrant_minted_by_an_untrusted_key_is_refused(self):
        attacker = SigningKey.generate()
        forged = (
            mint_task_warrant(attacker, self.worker.public_key, TOOLS)
        )
        args = {"order_id": ORDER_ID, "amount": 20}
        meta = self.envelope(forged, [], self.worker, args)
        result = self.verifier.verify(VAULT_TOOL, args, meta=meta)
        self.assertFalse(result.allowed)
        self.assertIn("not trusted", result.denial_reason)

    def test_a_signature_by_the_wrong_key_is_refused(self):
        args = {"order_id": ORDER_ID, "amount": 20}
        meta = self.envelope(self.child, [self.task], HolderIdentity.generate(), args)
        result = self.verifier.verify(VAULT_TOOL, args, meta=meta)
        self.assertFalse(result.allowed)
        self.assertIn("Proof-of-Possession", result.denial_reason)
