from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock

from anthropic_managed_agents_e2b.settings import EXAMPLE_ROOT

DEFAULT_STORE_PATH = EXAMPLE_ROOT / ".managed-agent-sandbox-store.json"


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _store_path() -> Path:
    return Path(os.environ.get("APP_SANDBOX_STORE_PATH", DEFAULT_STORE_PATH))


@dataclass(frozen=True)
class SandboxAssignment:
    environment_id: str
    routing_scope: str
    routing_id: str
    session_id: str
    sandbox_id: str
    status: str
    created_at: str
    updated_at: str


class JsonSandboxStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _store_path()
        self._lock = Lock()

    def list(self) -> list[SandboxAssignment]:
        with self._lock:
            return self._read()

    def get(
        self, *, environment_id: str, routing_scope: str, routing_id: str
    ) -> SandboxAssignment | None:
        with self._lock:
            for assignment in self._read():
                if (
                    assignment.environment_id == environment_id
                    and assignment.routing_scope == routing_scope
                    and assignment.routing_id == routing_id
                ):
                    return assignment
        return None

    def upsert(
        self,
        *,
        environment_id: str,
        routing_scope: str,
        routing_id: str,
        session_id: str,
        sandbox_id: str,
        status: str = "active",
    ) -> SandboxAssignment:
        with self._lock:
            assignments = self._read()
            now = _now()
            existing = next(
                (
                    item
                    for item in assignments
                    if item.environment_id == environment_id
                    and item.routing_scope == routing_scope
                    and item.routing_id == routing_id
                ),
                None,
            )
            assignment = SandboxAssignment(
                environment_id=environment_id,
                routing_scope=routing_scope,
                routing_id=routing_id,
                session_id=session_id,
                sandbox_id=sandbox_id,
                status=status,
                created_at=existing.created_at if existing else now,
                updated_at=now,
            )
            updated = [
                item
                for item in assignments
                if not (
                    item.environment_id == environment_id
                    and item.routing_scope == routing_scope
                    and item.routing_id == routing_id
                )
            ]
            updated.append(assignment)
            self._write(updated)
            return assignment

    def remove_sandbox(self, *, sandbox_id: str) -> None:
        with self._lock:
            self._write([item for item in self._read() if item.sandbox_id != sandbox_id])

    def _read(self) -> list[SandboxAssignment]:
        if not self.path.exists():
            return []
        text = self.path.read_text()
        if not text.strip():
            return []
        raw = json.loads(text)
        if not isinstance(raw, list):
            return []
        return [
            SandboxAssignment(
                environment_id=str(item["environment_id"]),
                routing_scope=str(item.get("routing_scope", "session")),
                routing_id=str(item.get("routing_id", item["session_id"])),
                session_id=str(item["session_id"]),
                sandbox_id=str(item["sandbox_id"]),
                status=str(item.get("status", "active")),
                created_at=str(item["created_at"]),
                updated_at=str(item["updated_at"]),
            )
            for item in raw
            if isinstance(item, dict)
            and item.get("environment_id")
            and item.get("session_id")
            and item.get("sandbox_id")
            and item.get("created_at")
            and item.get("updated_at")
        ]

    def _write(self, assignments: list[SandboxAssignment]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps([asdict(item) for item in assignments], indent=2, sort_keys=True) + "\n"
        )
