"""Contract tests for the SEO backlinks repositories (seo/backlinks/stores.py).

Mirrors tests/seo/test_search_stores.py: parametrised memory/file backends,
create + read-back, enum round-trip, cross-tenant isolation, restart
persistence. No network, no paid calls.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import seo.backlinks.stores as bs
from seo.backlinks.stores import (
    ALL_REPOSITORIES,
    Backlink,
    BacklinkProject,
    BacklinkSnapshot,
    DomainStatus,
    LinkRel,
    LinkStatus,
    ReferringDomain,
    SyncStatus,
    get_backlink_project_repository,
    get_backlink_repository,
    get_backlink_snapshot_repository,
    get_referring_domain_repository,
)


@pytest.fixture(params=["memory", "file"])
def backend(request, tmp_path, monkeypatch):
    if request.param == "file":
        monkeypatch.setenv("PIXIE_PERSIST", "file")
        monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    else:
        monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    bs.reset_repositories()
    yield request.param
    bs.reset_repositories()
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)


# ── BacklinkProject ───────────────────────────────────────────────────────────

def test_backlink_project_create_and_roundtrip(backend):
    repo = get_backlink_project_repository()
    pid, proj = repo.create(BacklinkProject(
        tenant_id="t_a",
        site_id="site_1",
        provider="mock",
        sync_status=SyncStatus.IDLE,
    ))
    assert pid.startswith("blproj_")
    got = repo.get("t_a", pid)
    assert got is not None
    _, back = got
    assert back.site_id == "site_1"
    assert back.sync_status is SyncStatus.IDLE
    assert back.created_at  # stamped by _AutoRepo


def test_backlink_project_enum_roundtrip(backend):
    repo = get_backlink_project_repository()
    pid, _ = repo.create(BacklinkProject(
        tenant_id="t_a", site_id="s1", sync_status=SyncStatus.RUNNING,
    ))
    result = repo.update("t_a", pid, sync_status=SyncStatus.COMPLETED)
    assert result is not None
    _, obj = result
    assert obj.sync_status is SyncStatus.COMPLETED


def test_backlink_project_get_by_site(backend):
    repo = get_backlink_project_repository()
    repo.create(BacklinkProject(tenant_id="t_a", site_id="site_1"))
    repo.create(BacklinkProject(tenant_id="t_a", site_id="site_2"))
    found = repo.get_by_site("t_a", "site_1")
    assert found is not None
    _, proj = found
    assert proj.site_id == "site_1"
    assert repo.get_by_site("t_a", "site_99") is None


# ── Backlink ──────────────────────────────────────────────────────────────────

def test_backlink_create_and_roundtrip(backend):
    repo = get_backlink_repository()
    bid, bl = repo.create(Backlink(
        tenant_id="t_a",
        site_id="site_1",
        source_url="https://example.com/page",
        source_domain="example.com",
        target_url="https://client.com/",
        anchor_text="click here",
        rel=LinkRel.FOLLOW,
        status=LinkStatus.ACTIVE,
        dedup_key="abc123",
        provider_metrics={"domain_rating": 45},
    ))
    assert bid.startswith("bl_")
    got = repo.get("t_a", bid)
    assert got is not None
    _, back = got
    assert back.source_url == "https://example.com/page"
    assert back.rel is LinkRel.FOLLOW
    assert back.status is LinkStatus.ACTIVE
    assert back.provider_metrics == {"domain_rating": 45}


def test_backlink_rel_enum_roundtrip(backend):
    repo = get_backlink_repository()
    for rel in LinkRel:
        bid, _ = repo.create(Backlink(
            tenant_id="t_a", site_id="s1",
            source_url=f"https://src.com/{rel.value}",
            source_domain="src.com",
            target_url="https://client.com/",
            anchor_text="test",
            rel=rel,
            dedup_key=f"key_{rel.value}",
        ))
        _, back = repo.get("t_a", bid)
        assert back.rel is rel, f"rel enum failed for {rel}"


def test_backlink_status_enum_roundtrip(backend):
    repo = get_backlink_repository()
    bid, _ = repo.create(Backlink(
        tenant_id="t_a", site_id="s1",
        source_url="https://x.com/",
        source_domain="x.com",
        target_url="https://c.com/",
        anchor_text="a",
        status=LinkStatus.ACTIVE,
        dedup_key="d1",
    ))
    result = repo.update("t_a", bid, status=LinkStatus.LOST)
    assert result is not None
    _, obj = result
    assert obj.status is LinkStatus.LOST


def test_backlink_list_by_site_with_status_filter(backend):
    repo = get_backlink_repository()
    repo.create(Backlink(tenant_id="t_a", site_id="s1", source_url="https://a.com/",
                         source_domain="a.com", target_url="https://c.com/",
                         anchor_text="a", status=LinkStatus.ACTIVE, dedup_key="k1"))
    repo.create(Backlink(tenant_id="t_a", site_id="s1", source_url="https://b.com/",
                         source_domain="b.com", target_url="https://c.com/",
                         anchor_text="b", status=LinkStatus.LOST, dedup_key="k2"))

    all_bls = repo.list_by_site("t_a", "s1")
    assert len(all_bls) == 2
    active = repo.list_by_site("t_a", "s1", status=LinkStatus.ACTIVE)
    assert len(active) == 1
    assert active[0][1].source_domain == "a.com"
    lost = repo.list_by_site("t_a", "s1", status=LinkStatus.LOST)
    assert len(lost) == 1


def test_backlink_get_by_dedup_key(backend):
    repo = get_backlink_repository()
    repo.create(Backlink(tenant_id="t_a", site_id="s1",
                         source_url="https://x.com/", source_domain="x.com",
                         target_url="https://c.com/", anchor_text="text",
                         dedup_key="my_key"))
    found = repo.get_by_dedup_key("t_a", "s1", "my_key")
    assert found is not None
    _, bl = found
    assert bl.source_domain == "x.com"
    assert repo.get_by_dedup_key("t_a", "s1", "missing_key") is None


def test_backlink_provider_metrics_none(backend):
    """provider_metrics=None must be stored and retrieved as None, not fabricated."""
    repo = get_backlink_repository()
    bid, _ = repo.create(Backlink(
        tenant_id="t_a", site_id="s1",
        source_url="https://x.com/", source_domain="x.com",
        target_url="https://c.com/", anchor_text="",
        provider_metrics=None, dedup_key="d_none"
    ))
    _, back = repo.get("t_a", bid)
    assert back.provider_metrics is None


# ── ReferringDomain ───────────────────────────────────────────────────────────

def test_referring_domain_create_and_roundtrip(backend):
    repo = get_referring_domain_repository()
    rid, rd = repo.create(ReferringDomain(
        tenant_id="t_a",
        site_id="site_1",
        domain="example.com",
        backlink_count=5,
        follow_count=3,
        nofollow_count=2,
        status=DomainStatus.ACTIVE,
        top_anchors=["click here", "learn more"],
    ))
    assert rid.startswith("bldom_")
    got = repo.get("t_a", rid)
    assert got is not None
    _, back = got
    assert back.domain == "example.com"
    assert back.status is DomainStatus.ACTIVE
    assert back.backlink_count == 5
    assert back.top_anchors == ["click here", "learn more"]


def test_referring_domain_status_enum(backend):
    repo = get_referring_domain_repository()
    rid, _ = repo.create(ReferringDomain(
        tenant_id="t_a", site_id="s1", domain="x.com",
        status=DomainStatus.ACTIVE,
    ))
    result = repo.update("t_a", rid, status=DomainStatus.LOST)
    assert result is not None
    _, obj = result
    assert obj.status is DomainStatus.LOST


def test_referring_domain_get_by_domain(backend):
    repo = get_referring_domain_repository()
    repo.create(ReferringDomain(tenant_id="t_a", site_id="s1", domain="alpha.com"))
    repo.create(ReferringDomain(tenant_id="t_a", site_id="s1", domain="beta.com"))
    found = repo.get_by_domain("t_a", "s1", "alpha.com")
    assert found is not None
    _, rd = found
    assert rd.domain == "alpha.com"
    assert repo.get_by_domain("t_a", "s1", "missing.com") is None


def test_referring_domain_list_by_site_status_filter(backend):
    repo = get_referring_domain_repository()
    repo.create(ReferringDomain(tenant_id="t_a", site_id="s1",
                                domain="a.com", status=DomainStatus.ACTIVE))
    repo.create(ReferringDomain(tenant_id="t_a", site_id="s1",
                                domain="b.com", status=DomainStatus.LOST))
    active = repo.list_by_site("t_a", "s1", status=DomainStatus.ACTIVE)
    assert len(active) == 1
    assert active[0][1].domain == "a.com"


# ── BacklinkSnapshot ──────────────────────────────────────────────────────────

def test_backlink_snapshot_create_and_roundtrip(backend):
    repo = get_backlink_snapshot_repository()
    sid, snap = repo.create(BacklinkSnapshot(
        tenant_id="t_a",
        site_id="site_1",
        date="2026-07-29",
        total_backlinks=100,
        referring_domains=50,
        new_links=10,
        lost_links=2,
        follow_count=70,
        nofollow_count=30,
    ))
    assert sid.startswith("blsnap_")
    _, back = repo.get("t_a", sid)
    assert back.date == "2026-07-29"
    assert back.total_backlinks == 100
    assert back.follow_count == 70
    assert back.created_at  # stamped


def test_backlink_snapshot_list_by_site_ordered(backend):
    repo = get_backlink_snapshot_repository()
    repo.create(BacklinkSnapshot(tenant_id="t_a", site_id="s1",
                                 date="2026-07-02", total_backlinks=105))
    repo.create(BacklinkSnapshot(tenant_id="t_a", site_id="s1",
                                 date="2026-07-01", total_backlinks=100))
    pairs = repo.list_by_site("t_a", "s1")
    dates = [s.date for _, s in pairs]
    assert dates == ["2026-07-01", "2026-07-02"]


def test_backlink_snapshot_latest(backend):
    repo = get_backlink_snapshot_repository()
    repo.create(BacklinkSnapshot(tenant_id="t_a", site_id="s1",
                                 date="2026-07-01", total_backlinks=100))
    repo.create(BacklinkSnapshot(tenant_id="t_a", site_id="s1",
                                 date="2026-07-29", total_backlinks=200))
    latest = repo.latest("t_a", "s1")
    assert latest is not None
    _, snap = latest
    assert snap.total_backlinks == 200
    assert snap.date == "2026-07-29"
    assert repo.latest("t_a", "s_new") is None


# ── Cross-tenant isolation ────────────────────────────────────────────────────

def test_cross_tenant_isolation_backlinks(backend):
    repo = get_backlink_repository()
    bid, _ = repo.create(Backlink(
        tenant_id="t_a", site_id="s1",
        source_url="https://secret.com/", source_domain="secret.com",
        target_url="https://c.com/", anchor_text="secret", dedup_key="sec_key"
    ))
    # t_b must not see t_a's records
    assert repo.get("t_b", bid) is None
    assert repo.list_by_site("t_b", "s1") == []
    assert repo.get_by_dedup_key("t_b", "s1", "sec_key") is None


def test_cross_tenant_isolation_referring_domains(backend):
    repo = get_referring_domain_repository()
    rid, _ = repo.create(ReferringDomain(tenant_id="t_a", site_id="s1", domain="priv.com"))
    assert repo.get("t_b", rid) is None
    assert repo.get_by_domain("t_b", "s1", "priv.com") is None


# ── File-mode restart persistence ────────────────────────────────────────────

def test_file_mode_survives_restart(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    bs.reset_repositories()

    repo = get_backlink_project_repository()
    pid, _ = repo.create(BacklinkProject(tenant_id="t_a", site_id="persisted_site"))

    bs.reset_repositories()   # simulate process restart
    repo2 = get_backlink_project_repository()
    got = repo2.get("t_a", pid)
    assert got is not None
    _, proj = got
    assert proj.site_id == "persisted_site"

    bs.reset_repositories()
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)


# ── ALL_REPOSITORIES coverage ─────────────────────────────────────────────────

def test_all_repositories_count():
    assert len(ALL_REPOSITORIES) == 4


def test_all_repositories_have_table_names():
    for cls in ALL_REPOSITORIES:
        assert cls.table_name, f"{cls.__name__} missing table_name"
        assert cls.id_prefix, f"{cls.__name__} missing id_prefix"
        # No digits in table name (per hard constraint)
        assert not any(c.isdigit() for c in cls.table_name), \
            f"{cls.__name__}.table_name contains digits: {cls.table_name}"
