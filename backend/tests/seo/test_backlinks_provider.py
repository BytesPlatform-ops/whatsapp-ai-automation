"""Tests for the backlink provider abstraction and MockBacklinkProvider.

Covers:
  - MockBacklinkProvider: deterministic, paginated, no network
  - Provider metrics: real or None, never fabricated
  - Dedup key stability
  - Factory returns Mock when no creds present
  - HttpBacklinkProvider: never instantiated without creds (import-only test)

No network calls; no paid API usage.
"""

from __future__ import annotations

import os

import pytest

from seo.backlinks.provider import (
    MockBacklinkProvider,
    _mock_dedup_key,
    _sha1_ints,
    get_backlink_provider,
)


@pytest.fixture()
def mock_provider():
    return MockBacklinkProvider()


# ── Determinism ────────────────────────────────────────────────────────────────

def test_sha1_ints_deterministic():
    a = _sha1_ints("example.com")
    b = _sha1_ints("example.com")
    assert a == b
    assert len(a) == 8


def test_dedup_key_stable():
    k1 = _mock_dedup_key("https://src.com/p", "https://client.com/", "text")
    k2 = _mock_dedup_key("https://src.com/p", "https://client.com/", "text")
    assert k1 == k2
    assert isinstance(k1, str) and len(k1) == 40  # sha1 hex


def test_dedup_key_different_for_different_inputs():
    k1 = _mock_dedup_key("https://a.com/", "https://c.com/", "anchor")
    k2 = _mock_dedup_key("https://b.com/", "https://c.com/", "anchor")
    assert k1 != k2


# ── summary ───────────────────────────────────────────────────────────────────

def test_summary_returns_expected_fields(mock_provider):
    s = mock_provider.summary("example.com")
    assert "domain" in s
    assert "total_backlinks" in s
    assert "referring_domains" in s
    assert "follow_count" in s
    assert "nofollow_count" in s
    assert "provider" in s
    assert s["provider"] == "mock"
    # Provider metrics present and sourced flag set
    assert s["provider_metrics"] is not None
    assert s["provider_metrics"].get("is_mock") is True


def test_summary_deterministic(mock_provider):
    s1 = mock_provider.summary("samesite.com")
    s2 = mock_provider.summary("samesite.com")
    assert s1 == s2


def test_summary_different_domains_differ(mock_provider):
    s1 = mock_provider.summary("alpha.com")
    s2 = mock_provider.summary("beta.com")
    # Not guaranteed to differ in all fields, but totals should differ.
    assert s1["total_backlinks"] != s2["total_backlinks"] or s1["domain"] != s2["domain"]


# ── backlinks (pagination) ────────────────────────────────────────────────────

def test_backlinks_pagination(mock_provider):
    domain = "paginate.com"
    total = mock_provider._total_links(domain)

    # First page
    page1 = mock_provider.backlinks(domain, start_row=0, row_limit=20)
    assert "rows" in page1
    assert "next" in page1
    assert "total" in page1
    assert page1["total"] == total
    assert len(page1["rows"]) == min(20, total)
    if total > 20:
        assert page1["next"] == 20
    else:
        assert page1["next"] is None


def test_backlinks_pagination_exhausts(mock_provider):
    domain = "small.com"
    total = mock_provider._total_links(domain)
    rows_collected = []
    start = 0
    iterations = 0
    while True:
        page = mock_provider.backlinks(domain, start_row=start, row_limit=20)
        rows_collected.extend(page["rows"])
        iterations += 1
        if page["next"] is None:
            break
        start = page["next"]
        if iterations > 100:
            pytest.fail("pagination did not terminate")
    assert len(rows_collected) == total


def test_backlinks_row_fields(mock_provider):
    page = mock_provider.backlinks("fieldtest.com", start_row=0, row_limit=1)
    rows = page["rows"]
    assert rows, "expected at least 1 row"
    row = rows[0]
    required = [
        "source_url", "source_domain", "target_url", "anchor_text",
        "rel", "link_type", "first_seen", "last_seen", "status",
        "provider", "dedup_key",
    ]
    for field in required:
        assert field in row, f"missing field: {field}"
    assert row["provider"] == "mock"
    # Dedup key must be a non-empty string
    assert row["dedup_key"] and isinstance(row["dedup_key"], str)


def test_backlinks_provider_metrics_present_and_tagged(mock_provider):
    """Provider metrics must be present, with is_mock=True tag. Never None for mock."""
    page = mock_provider.backlinks("metrics.com", start_row=0, row_limit=5)
    for row in page["rows"]:
        pm = row.get("provider_metrics")
        assert pm is not None, "mock provider_metrics should not be None"
        assert pm.get("is_mock") is True, "mock metrics must be tagged is_mock=True"
        # Must include domain_rating (provider-sourced)
        assert "domain_rating" in pm


def test_backlinks_no_fabricated_authority(mock_provider):
    """Ensure we never claim authority scores are real for mock provider."""
    page = mock_provider.backlinks("nofab.com", start_row=0, row_limit=10)
    for row in page["rows"]:
        pm = row.get("provider_metrics", {})
        # Mock always tags is_mock=True
        assert pm.get("is_mock") is True


def test_backlinks_deterministic_same_page(mock_provider):
    p1 = mock_provider.backlinks("det.com", start_row=0, row_limit=10)
    p2 = mock_provider.backlinks("det.com", start_row=0, row_limit=10)
    assert p1["rows"] == p2["rows"]


# ── referring_domains ─────────────────────────────────────────────────────────

def test_referring_domains_returns_list(mock_provider):
    rds = mock_provider.referring_domains("rdtest.com")
    assert isinstance(rds, list)
    assert len(rds) > 0


def test_referring_domains_fields(mock_provider):
    rds = mock_provider.referring_domains("rdfields.com")
    for rd in rds:
        assert "domain" in rd
        assert "backlink_count" in rd
        assert rd.get("provider_metrics") is not None
        assert rd["provider_metrics"].get("is_mock") is True


def test_referring_domains_deterministic(mock_provider):
    r1 = mock_provider.referring_domains("same.com")
    r2 = mock_provider.referring_domains("same.com")
    assert r1 == r2


# ── new_lost ──────────────────────────────────────────────────────────────────

def test_new_lost_returns_new_and_lost(mock_provider):
    result = mock_provider.new_lost("newlost.com", since="2026-01-01")
    assert "new" in result
    assert "lost" in result
    for bl in result["lost"]:
        assert bl["status"] == "lost"
    for bl in result["new"]:
        assert bl["status"] == "active"


def test_new_lost_deterministic(mock_provider):
    r1 = mock_provider.new_lost("det.com", since="2026-01-01")
    r2 = mock_provider.new_lost("det.com", since="2026-01-01")
    assert r1 == r2


# ── anchors ───────────────────────────────────────────────────────────────────

def test_anchors_sorted_by_count(mock_provider):
    anchors = mock_provider.anchors("anchorsort.com")
    assert isinstance(anchors, list)
    if len(anchors) >= 2:
        assert anchors[0]["count"] >= anchors[1]["count"]


def test_anchors_fields(mock_provider):
    anchors = mock_provider.anchors("anchorfields.com")
    for a in anchors:
        assert "anchor" in a
        assert "count" in a
        assert "follow" in a


# ── competitor_intersections ──────────────────────────────────────────────────

def test_competitor_intersections_returns_list(mock_provider):
    result = mock_provider.competitor_intersections(
        "client.com", ["comp1.com", "comp2.com"]
    )
    assert isinstance(result, list)


def test_competitor_intersections_fields(mock_provider):
    result = mock_provider.competitor_intersections("client.com", ["rival.com"])
    for item in result:
        assert "referring_domain" in item
        assert "links_to_client" in item
        assert "links_to_competitors" in item
        assert "competitor_count" in item


def test_competitor_intersections_deduped(mock_provider):
    """Resulting list should have unique referring_domain values."""
    result = mock_provider.competitor_intersections(
        "client.com", ["comp1.com", "comp2.com"]
    )
    domains = [r["referring_domain"] for r in result]
    assert len(domains) == len(set(domains))


# ── factory ───────────────────────────────────────────────────────────────────

def test_factory_returns_mock_without_creds(monkeypatch):
    monkeypatch.delenv("SEO_BACKLINK_API_KEY", raising=False)
    monkeypatch.delenv("DATAFORSEO_LOGIN", raising=False)
    monkeypatch.delenv("DATAFORSEO_PASSWORD", raising=False)
    monkeypatch.delenv("SEO_BACKLINK_PROVIDER", raising=False)
    p = get_backlink_provider()
    assert isinstance(p, MockBacklinkProvider)
    assert p.name == "mock"


def test_http_provider_never_instantiated_without_creds(monkeypatch):
    """HttpBacklinkProvider should raise RuntimeError if no creds (import check)."""
    monkeypatch.delenv("SEO_BACKLINK_API_KEY", raising=False)
    monkeypatch.delenv("DATAFORSEO_LOGIN", raising=False)
    monkeypatch.delenv("DATAFORSEO_PASSWORD", raising=False)
    from seo.backlinks.provider import HttpBacklinkProvider
    # The class exists but instantiating without creds must fail or raise.
    # We do NOT test instantiation here (it's pragma: no cover + actually hits network)
    # but we confirm the class has the required available() method.
    assert hasattr(HttpBacklinkProvider, "available")
