"""
Minimal Python client for the Brainbase Universal Harness API.

One HTTP call spins up an isolated cloud dev sandbox running the coding agent
(harness) of your choice, drives it multi-turn, lets you read its files, and
exposes its running ports behind a preview URL.

Docs: https://docs.brainbaselabs.com/api
Base: https://api.brainbaselabs.com/v2

Env:
  BRAINBASE_API_KEY  - bearer token from app.brainbaselabs.com/api-keys
  BRAINBASE_BASE_URL - optional override (default https://api.brainbaselabs.com)
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Iterator

import httpx

DEFAULT_BASE = os.environ.get("BRAINBASE_BASE_URL", "https://api.brainbaselabs.com")
TERMINAL_STATES = {"success", "fail", "need_more_info", "idle"}


class BrainbaseError(RuntimeError):
    pass


@dataclass
class Preview:
    url: str
    port: int
    token: str | None
    token_header: str | None

    @property
    def is_branded(self) -> bool:
        """A branded link is public (proxy injects the provider token), so mas
        nulls token/token_header. Raw provider links carry them."""
        return not (self.token and self.token_header)

    @property
    def headers(self) -> dict[str, str]:
        """Headers to reach the preview URL. Empty for a branded link (it needs
        none); the token header for a raw provider link."""
        if self.is_branded:
            return {}
        return {self.token_header: self.token}  # type: ignore[dict-item]


class Brainbase:
    def __init__(self, api_key: str | None = None, base_url: str = DEFAULT_BASE, timeout: float = 60.0):
        self.api_key = api_key or os.environ.get("BRAINBASE_API_KEY")
        if not self.api_key:
            raise BrainbaseError("Set BRAINBASE_API_KEY (see .env.template).")
        self.base = base_url.rstrip("/")
        self._http = httpx.Client(
            base_url=self.base,
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=timeout,
        )

    # ---- low level ---------------------------------------------------------
    def _req(self, method: str, path: str, **kw) -> Any:
        r = self._http.request(method, path, **kw)
        if r.status_code >= 400:
            raise BrainbaseError(f"{method} {path} -> {r.status_code}: {r.text[:500]}")
        if r.content and r.headers.get("content-type", "").startswith("application/json"):
            return r.json()
        return r.content

    # ---- threads -----------------------------------------------------------
    def create_thread(
        self,
        input: str,
        *,
        harness: str = "claude_code",
        model: str | None = None,
        machine_kind: str = "daytona",
        instructions: str | None = None,
        entrypoint: str | None = None,
        mcp_servers: list[dict] | None = None,
        skills: list[dict] | None = None,
        secrets: dict[str, str] | None = None,
        agent_id: str | None = None,
        group_id: str | None = None,
        title: str | None = None,
        metadata: dict | None = None,
    ) -> dict:
        """POST /v2/threads. Returns {thread_id, agent_id, status}.

        Pass either an inline `agent` spec (harness/model/...) or an existing
        `agent_id`. Identical inline specs are hashed and de-duplicated to the
        same agent_id, so re-calling is cheap.
        """
        body: dict[str, Any] = {"input": input}
        if agent_id:
            body["agent_id"] = agent_id
        else:
            agent: dict[str, Any] = {"harness": harness, "machine_kind": machine_kind}
            if model:
                agent["model"] = model
            if instructions:
                agent["instructions"] = instructions
            if entrypoint:
                agent["entrypoint"] = entrypoint
            if mcp_servers:
                agent["mcp_servers"] = mcp_servers
            if skills:
                agent["skills"] = skills
            if secrets:
                agent["secrets"] = secrets
            body["agent"] = agent
        if group_id:
            body["group_id"] = group_id
        if title:
            body["title"] = title
        if metadata:
            body["metadata"] = metadata
        return self._req("POST", "/v2/threads", json=body)

    def get_thread(self, thread_id: str) -> dict:
        """GET /v2/threads/{id}. Includes status, machine_id, sandbox_id."""
        return self._req("GET", f"/v2/threads/{thread_id}")

    def send_message(self, thread_id: str, content: str, role: str = "user", run: bool = True) -> dict:
        """POST /v2/threads/{id}/messages. Append a message and, with run=True,
        start the agent's next turn on the same sandbox. Without run the message is
        only recorded and no turn happens, so leave run=True for a normal follow-up."""
        return self._req(
            "POST",
            f"/v2/threads/{thread_id}/messages",
            json={"messages": [{"role": role, "content": content}], "run": run},
        )

    def get_messages(self, thread_id: str, limit: int = 200) -> list[dict]:
        return self._req("GET", f"/v2/threads/{thread_id}/messages", params={"limit": limit})["items"]

    def interrupt(self, thread_id: str) -> dict:
        return self._req("POST", f"/v2/threads/{thread_id}/interrupt")

    def wait(self, thread_id: str, *, poll_s: float = 5.0, timeout_s: float = 900.0) -> dict:
        """Poll until the current turn settles into a terminal status.

        Terminal means one of TERMINAL_STATES (success / fail / need_more_info /
        idle). Use this for the FIRST turn of a thread, where there is no earlier
        terminal status to trip over. For a follow-up turn, use run_and_wait,
        which guards against reading the previous turn's stale status.
        """
        deadline = time.monotonic() + timeout_s
        while True:
            t = self.get_thread(thread_id)
            if t.get("status") in TERMINAL_STATES:
                return t
            if time.monotonic() > deadline:
                raise BrainbaseError(f"thread {thread_id} did not settle in {timeout_s}s")
            time.sleep(poll_s)

    def run_and_wait(
        self,
        thread_id: str,
        content: str,
        *,
        role: str = "user",
        poll_s: float = 5.0,
        timeout_s: float = 600.0,
    ) -> dict:
        """Send a follow-up message, start its turn, and wait for THAT turn to end.

        Right after send_message the thread can still report the previous turn's
        terminal status for a moment. A naive "wait until not running" reads that
        stale status and returns at once, silently skipping the new turn. To avoid
        it, remember the transcript length first, then wait until it grows (the
        agent has replied) AND the status is terminal. A just-finished turn also
        holds its run slot briefly, so the send is retried while the API says 409.
        """
        before = len(self.get_messages(thread_id))
        deadline = time.monotonic() + timeout_s
        while True:
            try:
                self.send_message(thread_id, content, role=role)
                break
            except BrainbaseError as exc:
                if "-> 409" in str(exc) and time.monotonic() < deadline:
                    time.sleep(1.5)
                    continue
                raise
        while True:
            thread = self.get_thread(thread_id)
            replied = len(self.get_messages(thread_id)) > before + 1
            if replied and thread.get("status") in TERMINAL_STATES:
                return thread
            if time.monotonic() > deadline:
                raise BrainbaseError(f"follow-up turn on {thread_id} did not settle in {timeout_s}s")
            time.sleep(poll_s)

    def stream_events(self, thread_id: str, backfill: int = 0) -> Iterator[dict]:
        """SSE: GET /v2/threads/{id}/events/stream. Yields parsed event dicts.

        `backfill` replays up to N historic events on connect so you never miss
        the start of a turn. The stream stays open across turns (keepalives),
        so break out yourself on an `idle` event.
        """
        url = f"{self.base}/v2/threads/{thread_id}/events/stream"
        with httpx.stream(
            "GET",
            url,
            params={"backfill": backfill},
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=None,
        ) as r:
            if r.status_code >= 400:
                raise BrainbaseError(f"stream -> {r.status_code}: {r.read()[:300]!r}")
            for line in r.iter_lines():
                if not line or not line.startswith("data:"):
                    continue
                payload = line[len("data:"):].strip()
                if not payload:
                    continue
                try:
                    yield json.loads(payload)
                except json.JSONDecodeError:
                    continue

    # ---- files (note: file ops live under /v2/tasks/{id}, not /threads) -----
    def files_tree(self, thread_id: str, path: str = "", max_depth: int = 2, max_entries: int = 500) -> dict:
        return self._req(
            "GET",
            f"/v2/tasks/{thread_id}/files/tree",
            params={"path": path, "max_depth": max_depth, "max_entries": max_entries},
        )

    def files_stat(self, thread_id: str, path: str) -> dict:
        return self._req("GET", f"/v2/tasks/{thread_id}/files/stat", params={"path": path})

    def download(self, thread_id: str, path: str) -> bytes:
        """Pull a produced artifact. `path` is relative to the workspace root
        (/workspace), so pass "solution.py", not "/workspace/solution.py"
        (absolute paths currently 500). Use this, not files/read, which 404s."""
        return self._req("GET", f"/v2/tasks/{thread_id}/files/download", params={"path": path})

    def upload(self, thread_id: str, path: str, content: bytes) -> dict:
        files = {"file": (os.path.basename(path) or "file", content)}
        return self._req("POST", f"/v2/tasks/{thread_id}/files/upload", params={"path": path}, files=files)

    # ---- machines / preview -------------------------------------------------
    def preview(self, machine_id: str, port: int) -> Preview:
        """GET /v2/machines/{id}/preview?port=N. A raw provider URL is token-gated:
        send Preview.headers (the provider's token header) or it redirects to auth.
        A branded URL (when a branded domain is configured) is public and needs no
        header, so Preview.headers is empty. Preview.is_branded tells them apart."""
        d = self._req("GET", f"/v2/machines/{machine_id}/preview", params={"port": port})
        return Preview(
            url=d["url"], port=d.get("port", port),
            token=d.get("token"), token_header=d.get("token_header"),
        )

    def teardown_machine(self, machine_id: str) -> dict:
        """DELETE /v2/machines/{id}. Stop the sandbox (stops credit burn)."""
        return self._req("DELETE", f"/v2/machines/{machine_id}")

    def close(self) -> None:
        self._http.close()
