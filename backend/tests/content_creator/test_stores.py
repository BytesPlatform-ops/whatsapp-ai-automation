"""Tests for the Content Creator in-memory stores (stages 1-7).

No pytest required: plain ``test_*`` functions. Pydantic IS required (the stores
persist ``content_creator.schemas`` models), so the lead runs these in the venv.

Run (fake mode, $0):
    .venv/bin/python -c \
      "from tests.content_creator import test_stores as t; \
       [f() for n,f in vars(t).items() if n.startswith('test_')]; print('stores OK')"
"""

from __future__ import annotations

from content_creator.enums import (
    ApprovalGate,
    ApprovalStatus,
    IdentitySource,
    ProviderMode,
)
from content_creator.schemas import (
    CreatorProfile,
    Idea,
    InfluencerIdentity,
    ProviderConnection,
    Script,
)
from content_creator.store import (
    InMemoryApprovalRepository,
    InMemoryIdeaRepository,
    InMemoryIdentityRepository,
    InMemoryProfileRepository,
    InMemoryProviderRepository,
    InMemoryScriptRepository,
    get_profile_repository,
)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------
def test_profile_upsert_is_idempotent_same_tenant_and_name() -> None:
    repo = InMemoryProfileRepository()
    id1, _ = repo.save(CreatorProfile(tenant_id="t1", business_name="Acme"))
    id2, _ = repo.save(CreatorProfile(tenant_id="t1", business_name="Acme", niche="changed"))
    assert id1 == id2, "same tenant+business_name must map to one stable id"
    assert len(repo.list("t1")) == 1, "upsert must not create duplicates"
    # most-recent write wins
    _, active = repo.get_active("t1")
    assert active.niche == "changed"


def test_profile_business_name_is_case_and_space_insensitive() -> None:
    repo = InMemoryProfileRepository()
    id1, _ = repo.save(CreatorProfile(tenant_id="t1", business_name="Acme"))
    id2, _ = repo.save(CreatorProfile(tenant_id="t1", business_name="  acme  "))
    assert id1 == id2


def test_profile_cross_tenant_get_returns_none() -> None:
    repo = InMemoryProfileRepository()
    pid, _ = repo.save(CreatorProfile(tenant_id="t1", business_name="Acme"))
    assert repo.get("t1", pid) is not None
    assert repo.get("t2", pid) is None, "cross-tenant read must be indistinguishable from not-found"
    assert repo.list("t2") == []


def test_profile_get_active_most_recent_for_tenant() -> None:
    repo = InMemoryProfileRepository()
    repo.save(CreatorProfile(tenant_id="t1", business_name="Acme"))
    repo.save(CreatorProfile(tenant_id="t1", business_name="Beta"))
    _, active = repo.get_active("t1")
    assert active.business_name == "Beta"
    assert repo.get_active("nobody") is None


def test_profile_singleton_accessor() -> None:
    assert get_profile_repository() is get_profile_repository()


# ---------------------------------------------------------------------------
# Identity — exactly one active per tenant (locked-identity invariant)
# ---------------------------------------------------------------------------
def _active(tenant: str) -> InfluencerIdentity:
    return InfluencerIdentity(
        tenant_id=tenant, source=IdentitySource.GENERATED_CHARACTER, active=True
    )


def test_identity_second_active_deactivates_first() -> None:
    repo = InMemoryIdentityRepository()
    id1, _ = repo.save(_active("t1"))
    id2, _ = repo.save(_active("t1"))
    assert id1 != id2
    actives = [i for _, i in repo.list("t1") if i.active]
    assert len(actives) == 1, "exactly one active identity per tenant"
    # the active one is the most recently saved
    active_pair = repo.get_active("t1")
    assert active_pair is not None
    assert active_pair[0] == id2
    # the first is now inactive
    _, first = repo.get("t1", id1)
    assert first.active is False


def test_identity_cross_tenant_isolation() -> None:
    repo = InMemoryIdentityRepository()
    repo.save(_active("t1"))
    repo.save(_active("t2"))
    # each tenant keeps its own single active identity
    assert repo.get_active("t1") is not None
    assert repo.get_active("t2") is not None
    a1 = repo.get_active("t1")[1]
    a2 = repo.get_active("t2")[1]
    assert a1.tenant_id == "t1" and a2.tenant_id == "t2"
    # cross-tenant get is not-found
    id1, _ = repo.save(_active("t1"))
    assert repo.get("t2", id1) is None


def test_identity_saving_inactive_does_not_disturb_active() -> None:
    repo = InMemoryIdentityRepository()
    id_active, _ = repo.save(_active("t1"))
    repo.save(
        InfluencerIdentity(
            tenant_id="t1", source=IdentitySource.REFERENCE_IMAGE, active=False
        )
    )
    assert repo.get_active("t1")[0] == id_active


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------
def test_provider_upsert_by_mode() -> None:
    repo = InMemoryProviderRepository()
    id1, _ = repo.save(
        ProviderConnection(tenant_id="t1", mode=ProviderMode.PIXIE_ACCOUNT, connected=True)
    )
    id2, _ = repo.save(
        ProviderConnection(tenant_id="t1", mode=ProviderMode.PIXIE_ACCOUNT, final_price=9.0)
    )
    assert id1 == id2, "same (tenant, mode) -> one row"
    by_mode = repo.get_by_mode("t1", ProviderMode.PIXIE_ACCOUNT)
    assert by_mode is not None and by_mode[0] == id1
    assert repo.get_by_mode("t1", ProviderMode.USER_ACCOUNT) is None


def test_provider_get_active_returns_connected() -> None:
    repo = InMemoryProviderRepository()
    repo.save(
        ProviderConnection(tenant_id="t1", mode=ProviderMode.USER_ACCOUNT, connected=False)
    )
    repo.save(
        ProviderConnection(tenant_id="t1", mode=ProviderMode.PIXIE_ACCOUNT, connected=True)
    )
    active = repo.get_active("t1")
    assert active is not None and active[1].mode == ProviderMode.PIXIE_ACCOUNT


def test_provider_cross_tenant_get_returns_none() -> None:
    repo = InMemoryProviderRepository()
    cid, _ = repo.save(
        ProviderConnection(tenant_id="t1", mode=ProviderMode.PIXIE_ACCOUNT, connected=True)
    )
    assert repo.get("t2", cid) is None


# ---------------------------------------------------------------------------
# Idea
# ---------------------------------------------------------------------------
def test_idea_set_status_flips_approval() -> None:
    repo = InMemoryIdeaRepository()
    iid, idea = repo.save(Idea(tenant_id="t1", title="Hook one"))
    assert idea.approval_status == ApprovalStatus.PENDING
    updated = repo.set_status("t1", iid, ApprovalStatus.APPROVED)
    assert updated is not None and updated.approval_status == ApprovalStatus.APPROVED
    # persisted
    assert repo.get("t1", iid)[1].approval_status == ApprovalStatus.APPROVED


def test_idea_set_status_cross_tenant_returns_none() -> None:
    repo = InMemoryIdeaRepository()
    iid, _ = repo.save(Idea(tenant_id="t1", title="Hook one"))
    assert repo.set_status("t2", iid, ApprovalStatus.APPROVED) is None


def test_idea_list_is_tenant_scoped() -> None:
    repo = InMemoryIdeaRepository()
    repo.save(Idea(tenant_id="t1", title="A"))
    repo.save(Idea(tenant_id="t1", title="B"))
    repo.save(Idea(tenant_id="t2", title="C"))
    assert len(repo.list("t1")) == 2
    assert len(repo.list("t2")) == 1
    # upsert by (tenant, title) does not duplicate
    repo.save(Idea(tenant_id="t1", title="A", angle="changed"))
    assert len(repo.list("t1")) == 2


# ---------------------------------------------------------------------------
# Script
# ---------------------------------------------------------------------------
def test_script_set_status_and_tenant_scope() -> None:
    repo = InMemoryScriptRepository()
    sid, _ = repo.save(Script(tenant_id="t1", idea_ref="ccidea_x", hook="hi"))
    assert repo.set_status("t1", sid, ApprovalStatus.NEEDS_CHANGES).approval_status == (
        ApprovalStatus.NEEDS_CHANGES
    )
    assert repo.set_status("t2", sid, ApprovalStatus.APPROVED) is None
    assert repo.get("t2", sid) is None
    assert len(repo.list("t1")) == 1
    assert repo.list("t2") == []


def test_script_upsert_by_idea_ref() -> None:
    repo = InMemoryScriptRepository()
    id1, _ = repo.save(Script(tenant_id="t1", idea_ref="ccidea_x", body="v1"))
    id2, _ = repo.save(Script(tenant_id="t1", idea_ref="ccidea_x", body="v2"))
    assert id1 == id2
    assert repo.get("t1", id1)[1].body == "v2"


# ---------------------------------------------------------------------------
# Approval audit trail
# ---------------------------------------------------------------------------
def test_approval_record_and_list_filters_by_gate_and_tenant() -> None:
    repo = InMemoryApprovalRepository()
    repo.record("t1", ApprovalGate.IDEA, "ccidea_a", ApprovalStatus.APPROVED, note="ok")
    repo.record("t1", ApprovalGate.SCRIPT, "ccscript_a", ApprovalStatus.REJECTED)
    repo.record("t2", ApprovalGate.IDEA, "ccidea_z", ApprovalStatus.APPROVED)

    all_t1 = repo.list("t1")
    assert len(all_t1) == 2

    only_idea = repo.list("t1", gate=ApprovalGate.IDEA)
    assert len(only_idea) == 1
    assert only_idea[0].target_ref == "ccidea_a"
    assert only_idea[0].note == "ok"

    # tenant isolation
    assert len(repo.list("t2")) == 1
    assert repo.list("t2", gate=ApprovalGate.SCRIPT) == []


if __name__ == "__main__":  # pragma: no cover
    for _name, _fn in dict(globals()).items():
        if _name.startswith("test_"):
            _fn()
    print("content_creator stores OK")
