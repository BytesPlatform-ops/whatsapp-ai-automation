"""Tests for AI draft generation: grounding, security, approval gate, injection prevention."""

from __future__ import annotations

import pytest

import seo.outreach.stores as s
from seo.outreach import campaigns as camp
from seo.outreach import contacts as cont
from seo.outreach import drafts as draft_svc
from seo.outreach.stores import (
    CampaignStatus,
    DraftStatus,
)


@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    s.reset_repositories()
    yield
    s.reset_repositories()


def _setup_campaign_and_contact(tenant="t1"):
    """Helper: create a minimal campaign + contact ready for drafting."""
    _, contact = cont.add_contact(tenant, "target.com", email="editor@target.com", name="Bob")
    # Need contact_id, so fetch it.
    contacts = cont.list_contacts(tenant)
    contact_id = contacts[0][0]

    campaign_id, _ = camp.create_campaign(
        tenant,
        name="Link Gap Test",
        contact_ids=[contact_id],
        sender_identity="sender@myclient.com",
    )
    return campaign_id, contact_id


# ── Generation ────────────────────────────────────────────────────────────────

def test_generate_draft_returns_draft(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup_campaign_and_contact()
    did, d = draft_svc.generate_draft(
        "t1", campaign_id, contact_id,
        evidence={"source_url": "https://target.com/resources", "our_page": "https://myclient.com/guide"},
        is_mock=True,
    )
    assert did.startswith("odraft_")
    assert d.subject != ""
    assert d.body != ""
    assert d.version == 1
    assert not d.approved
    assert d.evidence  # evidence is stored


def test_generate_draft_grounded_shows_evidence(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup_campaign_and_contact()
    evidence = {"found_on": "resources page", "our_url": "https://myclient.com/guide"}
    did, d = draft_svc.generate_draft("t1", campaign_id, contact_id, evidence=evidence, is_mock=True)
    assert d.evidence == evidence


def test_generate_draft_increments_version(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup_campaign_and_contact()
    _, d1 = draft_svc.generate_draft("t1", campaign_id, contact_id, is_mock=True)
    _, d2 = draft_svc.generate_draft("t1", campaign_id, contact_id, is_mock=True)
    assert d1.version == 1
    assert d2.version == 2


def test_generate_draft_wrong_tenant_campaign_fails():
    campaign_id, contact_id = _setup_campaign_and_contact(tenant="t1")
    with pytest.raises(ValueError, match="campaign_not_found"):
        draft_svc.generate_draft("t2", campaign_id, contact_id, is_mock=True)


def test_generate_draft_wrong_tenant_contact_fails():
    campaign_id, _ = _setup_campaign_and_contact(tenant="t1")
    # Use a contact_id from a different tenant.
    _, c2 = cont.add_contact("t2", "other.com", email="x@other.com")
    contacts_t2 = cont.list_contacts("t2")
    contact_id_t2 = contacts_t2[0][0]
    with pytest.raises(ValueError, match="contact_not_found"):
        draft_svc.generate_draft("t1", campaign_id, contact_id_t2, is_mock=True)


# ── Billing zero in mock ───────────────────────────────────────────────────────

def test_generate_draft_billing_zero_when_mock(monkeypatch):
    """With is_mock=True and credit system OFF → zero cost, no crash."""
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup_campaign_and_contact()
    did, _ = draft_svc.generate_draft("t1", campaign_id, contact_id, is_mock=True)
    assert did  # no exception; billing was silently skipped


# ── Security: header injection prevention ─────────────────────────────────────

def test_header_injection_stripped_from_subject():
    cleaned = draft_svc._secure_subject("Subject line\r\nBcc: attacker@evil.com")
    assert "\r" not in cleaned
    assert "\n" not in cleaned


def test_header_injection_stripped_from_body_call():
    result = draft_svc._secure_body("Body line\r\nX-Extra: injected", check_urls=False)
    # CR+LF should be normalised to LF only (body text, not headers, but still cleaned).
    assert "\r" not in result


# ── Security: HTML injection prevention ───────────────────────────────────────

def test_html_escape_helper():
    escaped = draft_svc._escape_html("<script>alert('xss')</script>")
    assert "<script>" not in escaped
    assert "&lt;script&gt;" in escaped


# ── Security: open-redirect URL validation ────────────────────────────────────

def test_body_with_unsafe_url_is_cleaned():
    """URLs pointing to private/loopback addresses must be removed from body."""
    body_with_private = "Visit http://169.254.169.254/latest/meta-data for AWS metadata"
    cleaned = draft_svc._secure_body(body_with_private, check_urls=True)
    assert "http://169.254.169.254" not in cleaned
    assert "[URL_REMOVED]" in cleaned


def test_body_with_safe_url_is_unchanged():
    body_ok = "See our guide at https://example.com/guide for details."
    cleaned = draft_svc._secure_body(body_ok, check_urls=True)
    assert "https://example.com/guide" in cleaned


# ── Approval gate ─────────────────────────────────────────────────────────────

def test_approve_draft(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup_campaign_and_contact()
    did, _ = draft_svc.generate_draft("t1", campaign_id, contact_id, is_mock=True)
    result = draft_svc.approve_draft("t1", did, approved_by="manager@co.com")
    assert result is not None
    _, approved = result
    assert approved.approved is True
    assert approved.status == DraftStatus.APPROVED
    assert approved.approved_by == "manager@co.com"


def test_edit_draft_resets_approval(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup_campaign_and_contact()
    did, _ = draft_svc.generate_draft("t1", campaign_id, contact_id, is_mock=True)
    draft_svc.approve_draft("t1", did, approved_by="manager")
    # Edit the draft — approval must be reset.
    draft_svc.edit_draft("t1", did, subject="Edited Subject")
    _, reloaded = draft_svc.get_draft("t1", did)
    assert not reloaded.approved
    assert reloaded.status == DraftStatus.REVISED


def test_get_approved_draft_returns_none_when_none_approved(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup_campaign_and_contact()
    draft_svc.generate_draft("t1", campaign_id, contact_id, is_mock=True)
    result = draft_svc.get_approved_draft("t1", campaign_id, contact_id)
    assert result is None


def test_get_approved_draft_returns_highest_version(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup_campaign_and_contact()
    did1, _ = draft_svc.generate_draft("t1", campaign_id, contact_id, is_mock=True)
    did2, _ = draft_svc.generate_draft("t1", campaign_id, contact_id, is_mock=True)
    draft_svc.approve_draft("t1", did1, approved_by="m")
    draft_svc.approve_draft("t1", did2, approved_by="m")
    result = draft_svc.get_approved_draft("t1", campaign_id, contact_id)
    assert result is not None
    rid, d = result
    assert d.version == 2  # highest version
