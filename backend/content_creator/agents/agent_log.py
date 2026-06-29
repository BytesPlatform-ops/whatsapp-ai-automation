"""AgentLog — per-stage telemetry seam — PURE STDLIB.

Every pipeline stage writes one AgentLog. Tenant-scoped. The in-memory store
maps 1:1 to the Prisma `AgentLog` model; a durable store swaps in behind the
same surface later. Records carry model/prompt-version/cost/latency so the AI
vs deterministic rule is auditable. No secrets are ever logged.
"""

from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional


@dataclass
class AgentLog:
    tenant_id: str
    stage: str
    status: str                      # JobStatus value
    input_ref: str = ""
    output_ref: str = ""
    model: str = ""                  # "" when no AI was used (deterministic stage)
    prompt_version: str = ""
    estimated_cost: float = 0.0
    actual_cost: float = 0.0
    latency_ms: int = 0
    retry_count: int = 0
    error: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def _stable_id(*parts: str) -> str:
    return hashlib.sha1("|".join(p for p in parts if p).encode("utf-8")).hexdigest()[:16]


class InMemoryAgentLogStore:
    """Tenant-scoped, append-only log store. Monotonic seq, no wall-clock."""

    def __init__(self) -> None:
        self._by_tenant: Dict[str, List[dict]] = {}
        self._seq = 0

    def add(self, log: AgentLog) -> dict:
        self._seq += 1
        rec = log.to_dict()
        rec["id"] = _stable_id(log.tenant_id, log.stage, str(self._seq))
        rec["seq"] = self._seq
        self._by_tenant.setdefault(log.tenant_id, []).append(rec)
        return rec

    def list(self, tenant_id: str, stage: Optional[str] = None) -> List[dict]:
        rows = list(self._by_tenant.get(tenant_id, []))
        return [r for r in rows if stage is None or r["stage"] == stage]


_store: Optional[InMemoryAgentLogStore] = None


def get_agent_log_store() -> InMemoryAgentLogStore:
    global _store
    if _store is None:
        _store = InMemoryAgentLogStore()
    return _store
