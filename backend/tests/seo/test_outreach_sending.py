"""Tests for approval-gated sending: approval required, idempotency, manual fallback,
never real recipients, suppression, bounce/unsubscribe hooks."""

from __future__ import annotations

import pytest

import seo.outreach.stores as s
from seo.outreach import campaigns as camp
from seo.outreach import contacts as cont
from seo.outreach import drafts as draft_svc
from seo.outreach import sending
from seo.outreach.stores import (
    BounceStatus,
    CampaignStatus,
    RelationshipStatus,
)


@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.delenv("EMAIL_PROVIDER_API_KEY", raising=False)
    monkeypatch.delenv("RUN_LIVE_OUTREACH_TESTS", raising=False)
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    s.reset_repositories()
    sending.reset_idempotency_store()
    sending.reset_daily_counters()
    yield
    s.reset_repositories()
    sending.reset_idempotency_store()
    sending.reset_daily_counters()


def _setup(tenant="t1", approve_campaign=True, approve_draft=True, monkeypatch=None):
    """Create a campaign + contact + approved draft."""
    if monkeypatch:
        monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)

    _, contact = cont.add_contact(tenant, "target.com", email="bob@target.com", name="Bob")
    contacts = cont.list_contacts(tenant)
    contact_id = contacts[0][0]

    campaign_id, _ = camp.create_campaign(
        tenant,
        name="Test Campaign",
        contact_ids=[contact_id],
        sender_identity="outreach@myclient.com",
    )

    # Move through state machine.
    camp.transition(tenant, campaign_id, CampaignStatus.READY)
    if approve_campaign:
        camp.approve_campaign(tenant, campaign_id, approved_by="manager")

    # Generate and optionally approve draft.
    did, _ = draft_svc.generate_draft(tenant, campaign_id, contact_id, is_mock=True)
    if approve_draft:
        draft_svc.approve_draft(tenant, did, approved_by="manager")

    return campaign_id, contact_id, did


# ── Approval gate ─────────────────────────────────────────────────────────────

def test_send_blocked_without_campaign_approval(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    _, contact = cont.add_contact("t1", "t.com", email="x@t.com")
    contacts = cont.list_contacts("t1")
    cid = contacts[0][0]
    campaign_id, _ = camp.create_campaign("t1", name="C", contact_ids=[cid])
    camp.transition("t1", campaign_id, CampaignStatus.READY)
    # Not approved yet.
    result = sending.send_outreach_email("t1", campaign_id, cid, is_mock=True)
    assert result["status"] in ("blocked", "error")
    assert "approval" in result.get("reason", "").lower()


def test_send_blocked_without_approved_draft(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id, did = _setup(approve_draft=False, monkeypatch=monkeypatch)
    result = sending.send_outreach_email("t1", campaign_id, contact_id, is_mock=True)
    assert result["status"] == "blocked"
    assert "approved_draft" in result.get("reason", "")


# ── Successful send (manual fallback) ─────────────────────────────────────────

def test_send_manual_fallback_when_no_provider(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id, _ = _setup(monkeypatch=monkeypatch)
    result = sending.send_outreach_email("t1", campaign_id, contact_id, is_mock=True)
    assert result["status"] == "pending_manual"
    assert result["send_mode"] == "manual"
    assert result["copy_ready"] is True
    assert result["subject"] != ""


def test_send_never_real_recipients_in_test_mode(monkeypatch):
    """Even with EMAIL_PROVIDER_API_KEY set, no real send in test mode."""
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    monkeypatch.setenv("EMAIL_PROVIDER_API_KEY", "test_key_xyz")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")  # test mode
    campaign_id, contact_id, _ = _setup(monkeypatch=monkeypatch)
    # With is_mock=False but PIXIE_MODEL_MODE=fake, provider path is blocked.
    result = sending.send_outreach_email("t1", campaign_id, contact_id, is_mock=False)
    # The provider send would be blocked in test mode; should fall back to manual/pending.
    assert result["status"] in ("pending_manual", "skipped")


# ── Idempotency ───────────────────────────────────────────────────────────────

def test_send_idempotent_no_duplicate_send(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id, _ = _setup(monkeypatch=monkeypatch)
    r1 = sending.send_outreach_email("t1", campaign_id, contact_id, is_mock=True)
    r2 = sending.send_outreach_email("t1", campaign_id, contact_id, is_mock=True)
    assert r1["status"] in ("pending_manual", "success")
    assert r2["status"] == "skipped"
    assert r2["reason"] == "already_sent"


# ── Suppression ───────────────────────────────────────────────────────────────

def test_send_blocked_when_email_suppressed(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id, _ = _setup(monkeypatch=monkeypatch)
    cont.suppress_email("t1", "bob@target.com")
    result = sending.send_outreach_email("t1", campaign_id, contact_id, is_mock=True)
    assert result["status"] == "blocked"
    assert "suppressed" in result.get("reason", "")


# ── Bounce hook ───────────────────────────────────────────────────────────────

def test_hard_bounce_suppresses_email_and_marks_dnc():
    cont.add_contact("t1", "target.com", email="bounce@target.com")
    contacts = cont.list_contacts("t1")
    cid = contacts[0][0]
    sending.handle_bounce("t1", cid, hard=True)
    _, c = cont.get_contact("t1", cid)
    assert c.bounce_status == BounceStatus.HARD
    assert c.do_not_contact
    assert cont.is_suppressed("t1", "bounce@target.com")


def test_soft_bounce_does_not_suppress():
    cont.add_contact("t1", "target.com", email="soft@target.com")
    contacts = cont.list_contacts("t1")
    cid = contacts[0][0]
    sending.handle_bounce("t1", cid, hard=False)
    _, c = cont.get_contact("t1", cid)
    assert c.bounce_status == BounceStatus.SOFT
    assert not c.do_not_contact
    assert not cont.is_suppressed("t1", "soft@target.com")


# ── Unsubscribe hook ──────────────────────────────────────────────────────────

def test_unsubscribe_marks_dnc_and_suppresses():
    cont.add_contact("t1", "target.com", email="unsub@target.com")
    contacts = cont.list_contacts("t1")
    cid = contacts[0][0]
    sending.handle_unsubscribe("t1", cid)
    _, c = cont.get_contact("t1", cid)
    assert c.do_not_contact
    assert cont.is_suppressed("t1", "unsub@target.com")


# ── Cross-tenant: campaign ID guessing fails ─────────────────────────────────

def test_send_wrong_tenant_campaign_not_found(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id, _ = _setup(tenant="t1", monkeypatch=monkeypatch)
    # t2 tries to send using t1's campaign_id.
    result = sending.send_outreach_email("t2", campaign_id, contact_id, is_mock=True)
    assert result["status"] in ("error",)
    assert "not_found" in result.get("reason", "")
