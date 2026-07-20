"""Repository CONTRACT + restart-survival tests for the Content Creator stores.

Every assertion runs against BOTH backends via the ``store_backend`` fixture:
* ``memory``  — ``PIXIE_PERSIST`` unset (the hermetic default / in-memory repos)
* ``file``    — ``PIXIE_PERSIST=file`` in a tmp dir (the durable Durable* repos)

so the two implementations are proven to share one behavioural contract. The
``file`` runs additionally simulate a backend restart (``reset_repositories()``
drops cached singletons; fresh instances re-read the shared backing) to prove
pipeline state is durable.

Run (fake mode, $0):
    .venv/bin/python -m pytest tests/content_creator/test_persistence_contract.py -q
"""

from __future__ import annotations

import importlib

import pytest

import persistence
import content_creator.store as store
from content_creator.enums import (
    ApprovalGate,
    ApprovalStatus,
    IdentitySource,
    PlatformType,
    ProviderMode,
    VideoStatus,
)
from content_creator.schemas import (
    CreatorProfile,
    Idea,
    InfluencerIdentity,
    Post,
    ProviderConnection,
    Script,
    Video,
)


@pytest.fixture(params=["memory", "file"])
def store_backend(request, tmp_path, monkeypatch):
    """Configure the persistence backend, reset the repo cache, yield the store.

    Reloading ``persistence`` is unnecessary (it reads env per call); we just set
    the env and clear the cached singletons so the next accessor rebuilds for the
    selected backend.
    """
    if request.param == "file":
        monkeypatch.setenv("PIXIE_PERSIST", "file")
        monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    else:
        monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    store.reset_repositories()
    assert persistence.enabled() is (request.param == "file")
    yield store
    store.reset_repositories()


def _restart(store_mod):
    """Simulate a process restart: drop cached repos so the next accessor builds
    a fresh instance (file/supabase re-read shared backing; memory starts clean)."""
    store_mod.reset_repositories()


# ---------------------------------------------------------------------------
# Profile — create / get / get_active / list / idempotent upsert / isolation
# ---------------------------------------------------------------------------
def test_profile_crud_and_isolation(store_backend):
    repo = store_backend.get_profile_repository()
    pid, _ = repo.save(CreatorProfile(tenant_id="ws_A", business_name="Acme", niche="fitness"))

    got = repo.get("ws_A", pid)
    assert got is not None and got[1].business_name == "Acme"
    # missing record → None
    assert repo.get("ws_A", "ccprof_missing") is None
    # tenant separation — same id, wrong tenant → None (indistinguishable from missing)
    assert repo.get("ws_B", pid) is None
    assert repo.list("ws_B") == []
    assert [p.business_name for _, p in repo.list("ws_A")] == ["Acme"]


def test_profile_idempotent_upsert(store_backend):
    repo = store_backend.get_profile_repository()
    repo.save(CreatorProfile(tenant_id="ws_A", business_name="Acme", niche="v1"))
    repo.save(CreatorProfile(tenant_id="ws_A", business_name="Acme", niche="v2"))
    # same (tenant, business_name) → same id → one row, latest wins
    rows = repo.list("ws_A")
    assert len(rows) == 1
    assert repo.get_active("ws_A")[1].niche == "v2"


def test_profile_survives_restart(store_backend):
    repo = store_backend.get_profile_repository()
    repo.save(CreatorProfile(tenant_id="ws_A", business_name="Acme"))
    _restart(store_backend)
    survived = store_backend.get_profile_repository().get_active("ws_A")
    if persistence.enabled():
        assert survived is not None and survived[1].business_name == "Acme"
    else:
        assert survived is None  # memory intentionally resets on restart


# ---------------------------------------------------------------------------
# Identity — exactly-one-active invariant, nested payload, enum restoration
# ---------------------------------------------------------------------------
def test_identity_single_active_and_nested_payload(store_backend):
    repo = store_backend.get_identity_repository()
    repo.save(InfluencerIdentity(
        tenant_id="ws_A", source=IdentitySource.GENERATED_CHARACTER, active=True,
        characteristics={"look": "athletic", "voice_feel": "warm"},
    ))
    repo.save(InfluencerIdentity(
        tenant_id="ws_A", source=IdentitySource.REFERENCE_IMAGE, active=True,
        reference_ref="https://x/y.png",
    ))
    active = repo.get_active("ws_A")
    assert active is not None
    # enum restored as enum, not raw str
    assert active[1].source is IdentitySource.REFERENCE_IMAGE
    assert len([i for _, i in repo.list("ws_A") if i.active]) == 1
    assert len(repo.list("ws_A")) == 2
    # nested dict payload round-trips
    first = [i for _, i in repo.list("ws_A") if i.source is IdentitySource.GENERATED_CHARACTER][0]
    assert first.characteristics == {"look": "athletic", "voice_feel": "warm"}


# ---------------------------------------------------------------------------
# Provider — get_by_mode / get_active (connected) / get_latest ordering
# ---------------------------------------------------------------------------
def test_provider_modes_and_latest(store_backend):
    repo = store_backend.get_provider_repository()
    repo.save(ProviderConnection(tenant_id="ws_A", mode=ProviderMode.PROMPT_EXPORT, connected=False))
    repo.save(ProviderConnection(tenant_id="ws_A", mode=ProviderMode.PIXIE_MANAGED, connected=True))
    assert repo.get_by_mode("ws_A", ProviderMode.PROMPT_EXPORT)[1].mode is ProviderMode.PROMPT_EXPORT
    assert repo.get_active("ws_A")[1].mode is ProviderMode.PIXIE_MANAGED  # only connected one
    assert repo.get_latest("ws_A")[1].mode is ProviderMode.PIXIE_MANAGED  # most recently saved


# ---------------------------------------------------------------------------
# Idea — set_status update survives restart
# ---------------------------------------------------------------------------
def test_idea_status_update_survives_restart(store_backend):
    repo = store_backend.get_idea_repository()
    iid, _ = repo.save(Idea(tenant_id="ws_A", title="Hook A", score=88))
    assert repo.set_status("ws_A", iid, ApprovalStatus.APPROVED).approval_status is ApprovalStatus.APPROVED
    # updating a missing/cross-tenant idea → None
    assert repo.set_status("ws_B", iid, ApprovalStatus.APPROVED) is None
    _restart(store_backend)
    reloaded = store_backend.get_idea_repository().get("ws_A", iid)
    if persistence.enabled():
        assert reloaded[1].approval_status is ApprovalStatus.APPROVED


# ---------------------------------------------------------------------------
# Script — keyed by idea_ref (idempotent) vs free-standing (sequence)
# ---------------------------------------------------------------------------
def test_script_keying(store_backend):
    repo = store_backend.get_script_repository()
    repo.save(Script(tenant_id="ws_A", idea_ref="ccidea_1", body="v1"))
    repo.save(Script(tenant_id="ws_A", idea_ref="ccidea_1", body="v2"))
    repo.save(Script(tenant_id="ws_A", idea_ref="", body="free"))
    # idea-keyed script upserts (1 row for the idea) + 1 free-standing = 2 rows
    assert len(repo.list("ws_A")) == 2


# ---------------------------------------------------------------------------
# Approval — append-only audit trail, filterable by gate
# ---------------------------------------------------------------------------
def test_approval_append_only(store_backend):
    repo = store_backend.get_approval_repository()
    repo.record("ws_A", ApprovalGate.IDEA, "ccidea_1", ApprovalStatus.APPROVED)
    repo.record("ws_A", ApprovalGate.SCRIPT, "ccscript_1", ApprovalStatus.REJECTED, note="tone")
    repo.record("ws_A", ApprovalGate.IDEA, "ccidea_2", ApprovalStatus.APPROVED)
    assert len(repo.list("ws_A")) == 3  # append-only, nothing deduped
    assert len(repo.list("ws_A", ApprovalGate.IDEA)) == 2
    assert repo.list("ws_B") == []


# ---------------------------------------------------------------------------
# Video — enum + async-job fields, update() patch survives restart
# ---------------------------------------------------------------------------
def test_video_update_and_serialization(store_backend):
    repo = store_backend.get_video_repository()
    vid, _ = repo.save(Video(
        tenant_id="ws_A", script_ref="ccscript_1", status=VideoStatus.GENERATING,
        provider="higgsfield", provider_job_id="job_123", progress=0.2,
    ))
    repo.update("ws_A", vid, status=VideoStatus.READY, storage_url="https://s/x.mp4", progress=1.0)
    _restart(store_backend)
    reloaded = store_backend.get_video_repository().get("ws_A", vid)
    if persistence.enabled():
        v = reloaded[1]
        assert v.status is VideoStatus.READY          # enum restored
        assert v.storage_url == "https://s/x.mp4"     # patched field persisted
        assert v.provider_job_id == "job_123"         # untouched field intact
        assert v.progress == 1.0


# ---------------------------------------------------------------------------
# Post — composite key (video_ref + platform), enum restoration
# ---------------------------------------------------------------------------
def test_post_composite_key(store_backend):
    repo = store_backend.get_post_repository()
    repo.save(Post(tenant_id="ws_A", video_ref="ccvid_1", platform=PlatformType.META))
    repo.save(Post(tenant_id="ws_A", video_ref="ccvid_1", platform=PlatformType.INSTAGRAM))
    repo.save(Post(tenant_id="ws_A", video_ref="ccvid_1", platform=PlatformType.META))  # upsert
    posts = repo.list("ws_A")
    assert len(posts) == 2  # meta + instagram, meta upserted
    assert {p.platform for _, p in posts} == {PlatformType.META, PlatformType.INSTAGRAM}
