"""Durable, tenant-scoped repositories for the Content Creator pipeline.

Same method surface as the ``InMemory*Repository`` classes in ``store.py`` but
backed by the shared ``backend/persistence.py`` seam (``table()`` + ``envelope()``),
so records survive process restarts and are multi-instance safe when
``PIXIE_PERSIST=supabase``. ``store.get_*_repository()`` returns one of these
whenever ``persistence.enabled()`` is true; the ``InMemory*`` classes stay the
hermetic default (``PIXIE_PERSIST`` unset → tests / local dev).

Each record is stored as ONE normalized row via ``persistence.envelope``:
``{id, tenant_id, created_at, updated_at, data: <model.model_dump(mode="json")>}``
keyed by the SAME ``_stable_id`` scheme as the in-memory repos, and rebuilt with
``Model(**row["data"])``. Tenant scoping is enforced by the persistence layer:
a cross-tenant id is indistinguishable from "not found" (``get`` filters on
``tenant_id``; ``list_by_tenant`` only ever returns the caller's rows).

No secrets are stored here (BYOK credentials live in ``providers/credentials``,
sealed before persistence). ``model_dump(mode="json")`` keeps enums/values plain
so the same row round-trips through JSON (file) and Postgres (supabase).
"""

from __future__ import annotations

from typing import List, Optional, Tuple

import persistence

from .enums import ApprovalGate, ApprovalStatus, ProviderMode
from .schemas import (
    ApprovalRecord,
    CreatorProfile,
    Idea,
    InfluencerIdentity,
    Learning,
    Metric,
    PixieUsage,
    Post,
    ProviderConnection,
    QualityCheck,
    Script,
    Video,
)
from .store import _stable_id


class _DurableRepo:
    """Envelope helpers over one ``persistence`` table for a Pydantic model.

    Subclasses set ``table_name`` and ``model``; the base handles save (with
    created_at preservation on update), tenant-scoped get, and ordered listing.
    """

    table_name: str = ""
    model = None  # Pydantic model class

    def __init__(self) -> None:
        # One Repo per instance (file/supabase share backing → durable + multi-instance;
        # memory is process-local, matching the InMemory* isolation used by tests).
        self._repo = persistence.table(self.table_name)

    # -- row helpers -------------------------------------------------------
    def _save_row(self, row_id: str, tenant_id: str, model) -> None:
        existing = self._repo.get(tenant_id, row_id)
        created = existing.get("created_at") if existing else None
        self._repo.upsert(
            persistence.envelope(row_id, tenant_id, model.model_dump(mode="json"), created)
        )

    def _build(self, row: Optional[dict]):
        if not row:
            return None
        return self.model(**row["data"])

    def _get_model(self, tenant_id: str, row_id: str):
        return self._build(self._repo.get(tenant_id, row_id))

    def _rows_newest_first(self, tenant_id: str) -> List[dict]:
        # list_by_tenant is created_at-ordered; "most recently saved wins" needs
        # updated_at, which envelope() refreshes on every save.
        rows = self._repo.list_by_tenant(tenant_id)
        return sorted(rows, key=lambda r: r.get("updated_at", ""), reverse=True)

    def _next_seq(self, tenant_id: str) -> int:
        """Monotonic sequence derived from the durable row count for entities with
        no natural key (identity/learning/free-standing script). Survives restart
        because it is computed from persisted rows, not a process counter."""
        return len(self._repo.list_by_tenant(tenant_id)) + 1


# ---------------------------------------------------------------------------
# Stage 1 — Creator profile
# ---------------------------------------------------------------------------
class DurableProfileRepository(_DurableRepo):
    table_name = "cc_profiles"
    model = CreatorProfile

    def save(self, profile: CreatorProfile) -> Tuple[str, CreatorProfile]:
        profile_id = _stable_id(
            "ccprof_", profile.tenant_id, (profile.business_name or "").strip().lower()
        )
        self._save_row(profile_id, profile.tenant_id, profile)
        return profile_id, profile

    def get(self, tenant_id: str, profile_id: str) -> Optional[Tuple[str, CreatorProfile]]:
        m = self._get_model(tenant_id, profile_id)
        return (profile_id, m) if m else None

    def get_active(self, tenant_id: str) -> Optional[Tuple[str, CreatorProfile]]:
        for row in self._rows_newest_first(tenant_id):
            return row["id"], self._build(row)
        return None

    def list(self, tenant_id: str) -> List[Tuple[str, CreatorProfile]]:
        return [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]


# ---------------------------------------------------------------------------
# Stage 2 — Influencer identity (exactly one active per tenant)
# ---------------------------------------------------------------------------
class DurableIdentityRepository(_DurableRepo):
    table_name = "cc_identities"
    model = InfluencerIdentity

    def save(self, identity: InfluencerIdentity) -> Tuple[str, InfluencerIdentity]:
        if identity.active:
            for row in self._repo.list_by_tenant(identity.tenant_id):
                other = self._build(row)
                if other is not None and other.active:
                    self._save_row(row["id"], other.tenant_id, other.model_copy(update={"active": False}))
        identity_id = _stable_id(
            "ccid_", identity.tenant_id, "seq", str(self._next_seq(identity.tenant_id))
        )
        self._save_row(identity_id, identity.tenant_id, identity)
        return identity_id, identity

    def get(self, tenant_id: str, identity_id: str) -> Optional[Tuple[str, InfluencerIdentity]]:
        m = self._get_model(tenant_id, identity_id)
        return (identity_id, m) if m else None

    def get_active(self, tenant_id: str) -> Optional[Tuple[str, InfluencerIdentity]]:
        for row in self._repo.list_by_tenant(tenant_id):
            m = self._build(row)
            if m is not None and m.active:
                return row["id"], m
        return None

    def list(self, tenant_id: str) -> List[Tuple[str, InfluencerIdentity]]:
        return [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]


# ---------------------------------------------------------------------------
# Stage 3 — Provider connection (one row per (tenant, mode))
# ---------------------------------------------------------------------------
class DurableProviderRepository(_DurableRepo):
    table_name = "cc_provider_connections"
    model = ProviderConnection

    def save(self, conn: ProviderConnection) -> Tuple[str, ProviderConnection]:
        conn_id = _stable_id("ccprov_", conn.tenant_id, conn.mode.value)
        self._save_row(conn_id, conn.tenant_id, conn)
        return conn_id, conn

    def get(self, tenant_id: str, conn_id: str) -> Optional[Tuple[str, ProviderConnection]]:
        m = self._get_model(tenant_id, conn_id)
        return (conn_id, m) if m else None

    def get_by_mode(
        self, tenant_id: str, mode: ProviderMode
    ) -> Optional[Tuple[str, ProviderConnection]]:
        conn_id = _stable_id("ccprov_", tenant_id, mode.value)
        return self.get(tenant_id, conn_id)

    def get_active(self, tenant_id: str) -> Optional[Tuple[str, ProviderConnection]]:
        for row in self._rows_newest_first(tenant_id):
            m = self._build(row)
            if m is not None and m.connected:
                return row["id"], m
        return None

    def get_latest(self, tenant_id: str) -> Optional[Tuple[str, ProviderConnection]]:
        for row in self._rows_newest_first(tenant_id):
            return row["id"], self._build(row)
        return None

    def list(self, tenant_id: str) -> List[Tuple[str, ProviderConnection]]:
        return [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]


# ---------------------------------------------------------------------------
# Stage 4/5 — Ideas
# ---------------------------------------------------------------------------
class DurableIdeaRepository(_DurableRepo):
    table_name = "cc_ideas"
    model = Idea

    def save(self, idea: Idea) -> Tuple[str, Idea]:
        idea_id = _stable_id("ccidea_", idea.tenant_id, (idea.title or "").strip().lower())
        self._save_row(idea_id, idea.tenant_id, idea)
        return idea_id, idea

    def get(self, tenant_id: str, idea_id: str) -> Optional[Tuple[str, Idea]]:
        m = self._get_model(tenant_id, idea_id)
        return (idea_id, m) if m else None

    def list(self, tenant_id: str) -> List[Tuple[str, Idea]]:
        return [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]

    def set_status(self, tenant_id: str, idea_id: str, status: ApprovalStatus) -> Optional[Idea]:
        found = self.get(tenant_id, idea_id)
        if found is None:
            return None
        _, idea = found
        updated = idea.model_copy(update={"approval_status": status})
        self._save_row(idea_id, tenant_id, updated)
        return updated


# ---------------------------------------------------------------------------
# Stage 6/7 — Scripts
# ---------------------------------------------------------------------------
class DurableScriptRepository(_DurableRepo):
    table_name = "cc_scripts"
    model = Script

    def save(self, script: Script) -> Tuple[str, Script]:
        if script.idea_ref:
            script_id = _stable_id("ccscript_", script.tenant_id, script.idea_ref)
        else:
            script_id = _stable_id(
                "ccscript_", script.tenant_id, "seq", str(self._next_seq(script.tenant_id))
            )
        self._save_row(script_id, script.tenant_id, script)
        return script_id, script

    def get(self, tenant_id: str, script_id: str) -> Optional[Tuple[str, Script]]:
        m = self._get_model(tenant_id, script_id)
        return (script_id, m) if m else None

    def list(self, tenant_id: str) -> List[Tuple[str, Script]]:
        return [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]

    def set_status(self, tenant_id: str, script_id: str, status: ApprovalStatus) -> Optional[Script]:
        found = self.get(tenant_id, script_id)
        if found is None:
            return None
        _, script = found
        updated = script.model_copy(update={"approval_status": status})
        self._save_row(script_id, tenant_id, updated)
        return updated


# ---------------------------------------------------------------------------
# Cross-stage — Approval audit trail (append-only)
# ---------------------------------------------------------------------------
class DurableApprovalRepository(_DurableRepo):
    table_name = "cc_approvals"
    model = ApprovalRecord

    def record(
        self,
        tenant_id: str,
        gate: ApprovalGate,
        target_ref: str,
        status: ApprovalStatus,
        note: str = "",
    ) -> ApprovalRecord:
        rec = ApprovalRecord(
            tenant_id=tenant_id, gate=gate, target_ref=target_ref, status=status, note=note
        )
        # Append-only: unique id per record (never dedupe an audit entry).
        rec_id = _stable_id(
            "ccappr_", tenant_id, gate.value, target_ref, str(self._next_seq(tenant_id))
        )
        self._save_row(rec_id, tenant_id, rec)
        return rec

    def list(
        self, tenant_id: str, gate: Optional[ApprovalGate] = None
    ) -> List[ApprovalRecord]:
        out = []
        for r in self._repo.list_by_tenant(tenant_id):
            m = self._build(r)
            if m is not None and (gate is None or m.gate == gate):
                out.append(m)
        return out


# ---------------------------------------------------------------------------
# Stage 9 — Video / Stage 10 — Quality
# ---------------------------------------------------------------------------
class DurableVideoRepository(_DurableRepo):
    table_name = "cc_videos"
    model = Video

    def save(self, video: Video) -> Tuple[str, Video]:
        vid = _stable_id("ccvid_", video.tenant_id, video.script_ref or video.asset_ref)
        self._save_row(vid, video.tenant_id, video)
        return vid, video

    def get(self, tenant_id: str, video_id: str) -> Optional[Tuple[str, Video]]:
        m = self._get_model(tenant_id, video_id)
        return (video_id, m) if m else None

    def update(self, tenant_id: str, video_id: str, **fields) -> Optional[Tuple[str, Video]]:
        found = self.get(tenant_id, video_id)
        if found is None:
            return None
        _, video = found
        updated = video.model_copy(update=fields)
        self._save_row(video_id, tenant_id, updated)
        return video_id, updated

    def list(self, tenant_id: str) -> List[Tuple[str, Video]]:
        return [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]


class DurableQualityRepository(_DurableRepo):
    table_name = "cc_quality_checks"
    model = QualityCheck

    def save(self, check: QualityCheck) -> Tuple[str, QualityCheck]:
        cid = _stable_id("ccqc_", check.tenant_id, check.video_ref)
        self._save_row(cid, check.tenant_id, check)
        return cid, check

    def get_by_video(self, tenant_id: str, video_ref: str) -> Optional[Tuple[str, QualityCheck]]:
        cid = _stable_id("ccqc_", tenant_id, video_ref)
        m = self._get_model(tenant_id, cid)
        return (cid, m) if m else None


# ---------------------------------------------------------------------------
# Stage 12 — Posts / Stage 13 — Metrics + Learning + Usage
# ---------------------------------------------------------------------------
class DurablePostRepository(_DurableRepo):
    table_name = "cc_posts"
    model = Post

    def save(self, post: Post) -> Tuple[str, Post]:
        pid = _stable_id("ccpost_", post.tenant_id, post.video_ref, post.platform.value)
        self._save_row(pid, post.tenant_id, post)
        return pid, post

    def list(self, tenant_id: str) -> List[Tuple[str, Post]]:
        return [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]


class DurableMetricRepository(_DurableRepo):
    table_name = "cc_metrics"
    model = Metric

    def save(self, metric: Metric) -> Tuple[str, Metric]:
        mid = _stable_id("ccmetric_", metric.tenant_id, metric.post_ref)
        self._save_row(mid, metric.tenant_id, metric)
        return mid, metric

    def list(self, tenant_id: str) -> List[Tuple[str, Metric]]:
        return [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]


class DurableUsageRepository(_DurableRepo):
    table_name = "cc_usage"
    model = PixieUsage

    def save(self, usage: PixieUsage) -> Tuple[str, PixieUsage]:
        uid = _stable_id("ccusage_", usage.tenant_id, usage.video_ref or usage.provider_job_id)
        self._save_row(uid, usage.tenant_id, usage)
        return uid, usage

    def get_by_video(self, tenant_id: str, video_ref: str) -> Optional[Tuple[str, PixieUsage]]:
        uid = _stable_id("ccusage_", tenant_id, video_ref)
        m = self._get_model(tenant_id, uid)
        return (uid, m) if m else None

    def update(self, tenant_id: str, video_ref: str, **fields) -> Optional[Tuple[str, PixieUsage]]:
        found = self.get_by_video(tenant_id, video_ref)
        if found is None:
            return None
        uid, usage = found
        updated = usage.model_copy(update=fields)
        self._save_row(uid, tenant_id, updated)
        return uid, updated

    def list(self, tenant_id: str) -> List[Tuple[str, PixieUsage]]:
        return [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]


class DurableLearningRepository(_DurableRepo):
    table_name = "cc_learnings"
    model = Learning

    def save(self, learning: Learning) -> Tuple[str, Learning]:
        lid = _stable_id("cclearn_", learning.tenant_id, str(self._next_seq(learning.tenant_id)))
        self._save_row(lid, learning.tenant_id, learning)
        return lid, learning

    def get_latest(self, tenant_id: str) -> Optional[Tuple[str, Learning]]:
        for row in self._rows_newest_first(tenant_id):
            return row["id"], self._build(row)
        return None
