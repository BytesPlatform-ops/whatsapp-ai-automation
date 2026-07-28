"""Tests for link tracking: verify via injected fetcher, alert on disappearance,
cross-tenant isolation."""

from __future__ import annotations

import pytest

import seo.outreach.stores as s
from seo.outreach import campaigns as camp
from seo.outreach import link_tracking as lt
from seo.outreach.stores import PlacementOutcome


@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    s.reset_repositories()
    import seo.search_stores as ss
    ss.reset_repositories()
    yield
    s.reset_repositories()
    ss.reset_repositories()


def _make_campaign_and_placement(
    tenant="t1",
    target_url="https://myclient.com/guide",
    source_url="https://example.com/resources",
    anchor="great resource",
    outcome=PlacementOutcome.LINK_WON,
    first_verified="",
):
    camp.create_campaign(tenant, name="C", sender_identity="s@s.com")
    campaigns = camp.list_campaigns(tenant)
    campaign_id = campaigns[0][0]
    pid, p = lt.add_placement(
        tenant,
        campaign_id=campaign_id,
        contact_id="oc_dummy",
        outcome=outcome,
        target_url=target_url,
        source_url=source_url,
        anchor=anchor,
    )
    if first_verified:
        s.get_link_placement_repository().update(tenant, pid, first_verified=first_verified)
    return pid, p, campaign_id


def _fake_fetcher_with_link(url, timeout=20.0):
    """Fetcher that returns HTML containing the target link."""
    return {
        "html": '<html><body><a href="https://myclient.com/guide">great resource</a></body></html>',
        "final_url": url,
        "status": 200,
        "headers": {},
    }


def _fake_fetcher_without_link(url, timeout=20.0):
    """Fetcher that returns HTML NOT containing the target link."""
    return {
        "html": "<html><body><p>No relevant links here.</p></body></html>",
        "final_url": url,
        "status": 200,
        "headers": {},
    }


def _fake_fetcher_404(url, timeout=20.0):
    return {"html": "", "final_url": url, "status": 404, "headers": {}}


# ── add_placement ─────────────────────────────────────────────────────────────

def test_add_placement_basic():
    pid, p, _ = _make_campaign_and_placement()
    assert pid.startswith("lp_")
    assert p.outcome == PlacementOutcome.LINK_WON
    assert p.anchor == "great resource"


def test_add_placement_unsafe_url_rejected():
    camp.create_campaign("t1", name="C")
    campaigns = camp.list_campaigns("t1")
    campaign_id = campaigns[0][0]
    with pytest.raises(ValueError, match="unsafe_url"):
        lt.add_placement(
            "t1",
            campaign_id=campaign_id,
            contact_id="oc_x",
            source_url="http://169.254.169.254/metadata",
        )


def test_add_placement_wrong_tenant_campaign_rejected():
    """A placement referencing a campaign not owned by the tenant must be rejected."""
    camp.create_campaign("t1", name="C")
    campaigns_t1 = camp.list_campaigns("t1")
    campaign_id_t1 = campaigns_t1[0][0]
    # t2 tries to use t1's campaign_id.
    with pytest.raises(ValueError, match="campaign_not_found"):
        lt.add_placement("t2", campaign_id=campaign_id_t1, contact_id="oc_x")


# ── verify_placement: link present ────────────────────────────────────────────

def test_verify_placement_link_present(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    pid, _, _ = _make_campaign_and_placement()
    result = lt.verify_placement("t1", pid, fetcher=_fake_fetcher_with_link, is_mock=True)
    assert result["status"] == "present"
    assert result["detail"]["anchor_found"] is True


def test_verify_placement_marks_first_verified(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    pid, _, _ = _make_campaign_and_placement(outcome=PlacementOutcome.PENDING)
    result = lt.verify_placement("t1", pid, fetcher=_fake_fetcher_with_link, is_mock=True)
    assert result["status"] == "present"
    _, p = lt.get_placement("t1", pid)
    assert p.first_verified != ""
    # Should have been upgraded to LINK_WON.
    assert p.outcome == PlacementOutcome.LINK_WON


# ── verify_placement: link removed ────────────────────────────────────────────

def test_verify_placement_link_removed_creates_alert(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    # Simulate a previously verified won link.
    pid, _, campaign_id = _make_campaign_and_placement(
        outcome=PlacementOutcome.LINK_WON,
        first_verified="2026-07-01T00:00:00+00:00",
    )
    result = lt.verify_placement("t1", pid, fetcher=_fake_fetcher_without_link, is_mock=True)
    assert result["status"] == "removed"
    # Placement outcome should be REMOVED.
    _, p = lt.get_placement("t1", pid)
    assert p.outcome == PlacementOutcome.REMOVED
    # A SeoAlert should have been created.
    from seo.search_stores import get_alert_repository
    alerts = get_alert_repository().list("t1")
    assert any(a.alert_type == "earned_link_removed" for _, a in alerts)


def test_verify_placement_no_alert_when_never_verified(monkeypatch):
    """No alert when the link was never confirmed present (no first_verified)."""
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    pid, _, _ = _make_campaign_and_placement(outcome=PlacementOutcome.LINK_WON, first_verified="")
    lt.verify_placement("t1", pid, fetcher=_fake_fetcher_without_link, is_mock=True)
    from seo.search_stores import get_alert_repository
    alerts = get_alert_repository().list("t1")
    assert not any(a.alert_type == "earned_link_removed" for _, a in alerts)


# ── verify_placement: errors ──────────────────────────────────────────────────

def test_verify_placement_404_returns_error(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    pid, _, _ = _make_campaign_and_placement()
    result = lt.verify_placement("t1", pid, fetcher=_fake_fetcher_404, is_mock=True)
    assert result["status"] == "error"
    assert "404" in result["detail"]["reason"]


def test_verify_placement_not_found():
    result = lt.verify_placement("t1", "lp_nonexistent", fetcher=_fake_fetcher_with_link, is_mock=True)
    assert result["status"] == "error"
    assert "placement_not_found" in result["detail"]["reason"]


def test_verify_placement_wrong_tenant_returns_not_found(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    pid, _, _ = _make_campaign_and_placement(tenant="t1")
    result = lt.verify_placement("t2", pid, fetcher=_fake_fetcher_with_link, is_mock=True)
    assert result["status"] == "error"
    assert "placement_not_found" in result["detail"]["reason"]


# ── Billing zero ──────────────────────────────────────────────────────────────

def test_verify_billing_zero_when_mock(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    pid, _, _ = _make_campaign_and_placement()
    result = lt.verify_placement("t1", pid, fetcher=_fake_fetcher_with_link, is_mock=True)
    assert result["status"] == "present"  # zero billing, no crash
