"""Tenant-scoped persistence seam for the Content Creator pipeline (stages 1-7).

In-memory, process-local stores so the module is functional today and tenant
isolation + idempotency are actually exercised. A durable implementation (Prisma
content-creator models / Supabase Postgres) drops in behind the SAME method
surface in a later wave WITHOUT touching callers. No secrets stored here.

Mirrors the convention in ``backend/marketing/profile/repository.py`` and
``backend/seo/repository.py``:
* ``_stable_id(*parts)`` — sha1[:16] with an entity prefix, so re-saving the
  same natural key updates the row instead of duplicating it.
* upsert-by-stable-id, module-level singleton + lazy ``get_*_repository()``.
* tenant-scoped on EVERY read — a tenant mismatch is indistinguishable from
  "not found" (returns ``None`` / filtered out).

NOTE on ids: the Pydantic models in ``content_creator.schemas`` carry NO ``id``
field. We therefore key each dict by the computed stable id and surface that id
to callers by returning ``(id, model)`` tuples (saves/gets) — keeping the model
contract untouched while still exposing a stable handle.
"""

from __future__ import annotations

import hashlib
from typing import Dict, List, Optional, Tuple

from .schemas import (
    ApprovalRecord,
    CreatorProfile,
    Idea,
    InfluencerIdentity,
    ProviderConnection,
    Script,
)
from .enums import ApprovalGate, ApprovalStatus, ProviderMode


def _stable_id(*parts: str) -> str:
    """Deterministic short id. First part is treated as the entity prefix.

    ``_stable_id("ccprof_", tenant_id, key)`` -> ``ccprof_<sha1[:16]>``.
    """
    prefix = parts[0] if parts else ""
    raw = "|".join(p for p in parts[1:] if p)
    return prefix + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Stage 1 — Creator profile (intake)
# ---------------------------------------------------------------------------
class InMemoryProfileRepository:
    """Process-local creator-profile store. Tenant-scoped on every read/write."""

    def __init__(self) -> None:
        self._profiles: Dict[str, CreatorProfile] = {}  # id -> profile
        self._order: List[str] = []                     # save order (for get_active)

    def save(self, profile: CreatorProfile) -> Tuple[str, CreatorProfile]:
        """Upsert. Same ``(tenant_id, business_name.lower())`` -> same id -> update."""
        profile_id = _stable_id(
            "ccprof_", profile.tenant_id, (profile.business_name or "").strip().lower()
        )
        self._profiles[profile_id] = profile
        # most-recently-saved wins: move/append to the tail of the order list.
        if profile_id in self._order:
            self._order.remove(profile_id)
        self._order.append(profile_id)
        return profile_id, profile

    def get(self, tenant_id: str, profile_id: str) -> Optional[Tuple[str, CreatorProfile]]:
        profile = self._profiles.get(profile_id)
        if profile is None or profile.tenant_id != tenant_id:
            return None
        return profile_id, profile

    def get_active(self, tenant_id: str) -> Optional[Tuple[str, CreatorProfile]]:
        """Most-recently-saved profile for the tenant."""
        for profile_id in reversed(self._order):
            profile = self._profiles.get(profile_id)
            if profile is not None and profile.tenant_id == tenant_id:
                return profile_id, profile
        return None

    def list(self, tenant_id: str) -> List[Tuple[str, CreatorProfile]]:
        return [
            (pid, p)
            for pid, p in self._profiles.items()
            if p.tenant_id == tenant_id
        ]


# ---------------------------------------------------------------------------
# Stage 2 — Influencer identity (exactly one active per tenant)
# ---------------------------------------------------------------------------
class InMemoryIdentityRepository:
    """Process-local identity store. Enforces EXACTLY ONE active per tenant."""

    def __init__(self) -> None:
        self._identities: Dict[str, InfluencerIdentity] = {}  # id -> identity
        self._counter = 0

    def save(self, identity: InfluencerIdentity) -> Tuple[str, InfluencerIdentity]:
        """Persist an identity.

        Identities have no natural key, so we mint a monotonic id. Invariant:
        saving an ``active=True`` identity deactivates every OTHER identity for
        the same tenant first (the locked-identity rule).
        """
        if identity.active:
            for other_id, other in self._identities.items():
                if other.tenant_id == identity.tenant_id and other.active:
                    self._identities[other_id] = other.model_copy(update={"active": False})
        self._counter += 1
        identity_id = _stable_id(
            "ccid_", identity.tenant_id, "seq", str(self._counter)
        )
        self._identities[identity_id] = identity
        return identity_id, identity

    def get(self, tenant_id: str, identity_id: str) -> Optional[Tuple[str, InfluencerIdentity]]:
        identity = self._identities.get(identity_id)
        if identity is None or identity.tenant_id != tenant_id:
            return None
        return identity_id, identity

    def get_active(self, tenant_id: str) -> Optional[Tuple[str, InfluencerIdentity]]:
        for identity_id, identity in self._identities.items():
            if identity.tenant_id == tenant_id and identity.active:
                return identity_id, identity
        return None

    def list(self, tenant_id: str) -> List[Tuple[str, InfluencerIdentity]]:
        return [
            (iid, i)
            for iid, i in self._identities.items()
            if i.tenant_id == tenant_id
        ]


# ---------------------------------------------------------------------------
# Stage 3 — Provider connection (one row per (tenant, mode))
# ---------------------------------------------------------------------------
class InMemoryProviderRepository:
    """Process-local provider-connection store. Tenant-scoped on every read."""

    def __init__(self) -> None:
        self._conns: Dict[str, ProviderConnection] = {}  # id -> connection
        self._order: List[str] = []

    def save(self, conn: ProviderConnection) -> Tuple[str, ProviderConnection]:
        """Upsert. Same ``(tenant_id, mode)`` -> same id -> update."""
        conn_id = _stable_id("ccprov_", conn.tenant_id, conn.mode.value)
        self._conns[conn_id] = conn
        if conn_id in self._order:
            self._order.remove(conn_id)
        self._order.append(conn_id)
        return conn_id, conn

    def get(self, tenant_id: str, conn_id: str) -> Optional[Tuple[str, ProviderConnection]]:
        conn = self._conns.get(conn_id)
        if conn is None or conn.tenant_id != tenant_id:
            return None
        return conn_id, conn

    def get_by_mode(
        self, tenant_id: str, mode: ProviderMode
    ) -> Optional[Tuple[str, ProviderConnection]]:
        conn_id = _stable_id("ccprov_", tenant_id, mode.value)
        return self.get(tenant_id, conn_id)

    def get_active(self, tenant_id: str) -> Optional[Tuple[str, ProviderConnection]]:
        """Most-recently-saved connected connection for the tenant."""
        for conn_id in reversed(self._order):
            conn = self._conns.get(conn_id)
            if conn is not None and conn.tenant_id == tenant_id and conn.connected:
                return conn_id, conn
        return None

    def list(self, tenant_id: str) -> List[Tuple[str, ProviderConnection]]:
        return [
            (cid, c)
            for cid, c in self._conns.items()
            if c.tenant_id == tenant_id
        ]


# ---------------------------------------------------------------------------
# Stage 4/5 — Ideas
# ---------------------------------------------------------------------------
class InMemoryIdeaRepository:
    """Process-local idea store. Tenant-scoped on every read."""

    def __init__(self) -> None:
        self._ideas: Dict[str, Idea] = {}  # id -> idea

    def save(self, idea: Idea) -> Tuple[str, Idea]:
        """Upsert. Same ``(tenant_id, title)`` -> same id -> update."""
        idea_id = _stable_id("ccidea_", idea.tenant_id, (idea.title or "").strip().lower())
        self._ideas[idea_id] = idea
        return idea_id, idea

    def get(self, tenant_id: str, idea_id: str) -> Optional[Tuple[str, Idea]]:
        idea = self._ideas.get(idea_id)
        if idea is None or idea.tenant_id != tenant_id:
            return None
        return idea_id, idea

    def list(self, tenant_id: str) -> List[Tuple[str, Idea]]:
        return [
            (iid, i)
            for iid, i in self._ideas.items()
            if i.tenant_id == tenant_id
        ]

    def set_status(
        self, tenant_id: str, idea_id: str, status: ApprovalStatus
    ) -> Optional[Idea]:
        found = self.get(tenant_id, idea_id)
        if found is None:
            return None
        _, idea = found
        updated = idea.model_copy(update={"approval_status": status})
        self._ideas[idea_id] = updated
        return updated


# ---------------------------------------------------------------------------
# Stage 6/7 — Scripts
# ---------------------------------------------------------------------------
class InMemoryScriptRepository:
    """Process-local script store. Tenant-scoped on every read."""

    def __init__(self) -> None:
        self._scripts: Dict[str, Script] = {}  # id -> script
        self._counter = 0

    def save(self, script: Script) -> Tuple[str, Script]:
        """Upsert. Keyed on ``(tenant_id, idea_ref)`` when present, else a
        monotonic sequence (a free-standing script with no parent idea)."""
        if script.idea_ref:
            script_id = _stable_id("ccscript_", script.tenant_id, script.idea_ref)
        else:
            self._counter += 1
            script_id = _stable_id("ccscript_", script.tenant_id, "seq", str(self._counter))
        self._scripts[script_id] = script
        return script_id, script

    def get(self, tenant_id: str, script_id: str) -> Optional[Tuple[str, Script]]:
        script = self._scripts.get(script_id)
        if script is None or script.tenant_id != tenant_id:
            return None
        return script_id, script

    def list(self, tenant_id: str) -> List[Tuple[str, Script]]:
        return [
            (sid, s)
            for sid, s in self._scripts.items()
            if s.tenant_id == tenant_id
        ]

    def set_status(
        self, tenant_id: str, script_id: str, status: ApprovalStatus
    ) -> Optional[Script]:
        found = self.get(tenant_id, script_id)
        if found is None:
            return None
        _, script = found
        updated = script.model_copy(update={"approval_status": status})
        self._scripts[script_id] = updated
        return updated


# ---------------------------------------------------------------------------
# Cross-stage — Approval audit trail (append-only)
# ---------------------------------------------------------------------------
class InMemoryApprovalRepository:
    """Append-only owner-approval audit log. Tenant-scoped on every read."""

    def __init__(self) -> None:
        self._records: List[ApprovalRecord] = []

    def record(
        self,
        tenant_id: str,
        gate: ApprovalGate,
        target_ref: str,
        status: ApprovalStatus,
        note: str = "",
    ) -> ApprovalRecord:
        rec = ApprovalRecord(
            tenant_id=tenant_id,
            gate=gate,
            target_ref=target_ref,
            status=status,
            note=note,
        )
        self._records.append(rec)
        return rec

    def list(
        self, tenant_id: str, gate: Optional[ApprovalGate] = None
    ) -> List[ApprovalRecord]:
        return [
            r
            for r in self._records
            if r.tenant_id == tenant_id and (gate is None or r.gate == gate)
        ]


# ---------------------------------------------------------------------------
# Module-level singletons + lazy accessors
# ---------------------------------------------------------------------------
_profile_repo: Optional[InMemoryProfileRepository] = None
_identity_repo: Optional[InMemoryIdentityRepository] = None
_provider_repo: Optional[InMemoryProviderRepository] = None
_idea_repo: Optional[InMemoryIdeaRepository] = None
_script_repo: Optional[InMemoryScriptRepository] = None
_approval_repo: Optional[InMemoryApprovalRepository] = None


def get_profile_repository() -> InMemoryProfileRepository:
    global _profile_repo
    if _profile_repo is None:
        _profile_repo = InMemoryProfileRepository()
    return _profile_repo


def get_identity_repository() -> InMemoryIdentityRepository:
    global _identity_repo
    if _identity_repo is None:
        _identity_repo = InMemoryIdentityRepository()
    return _identity_repo


def get_provider_repository() -> InMemoryProviderRepository:
    global _provider_repo
    if _provider_repo is None:
        _provider_repo = InMemoryProviderRepository()
    return _provider_repo


def get_idea_repository() -> InMemoryIdeaRepository:
    global _idea_repo
    if _idea_repo is None:
        _idea_repo = InMemoryIdeaRepository()
    return _idea_repo


def get_script_repository() -> InMemoryScriptRepository:
    global _script_repo
    if _script_repo is None:
        _script_repo = InMemoryScriptRepository()
    return _script_repo


def get_approval_repository() -> InMemoryApprovalRepository:
    global _approval_repo
    if _approval_repo is None:
        _approval_repo = InMemoryApprovalRepository()
    return _approval_repo
