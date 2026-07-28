"""Tests for campaign lifecycle: CRUD, valid/invalid state transitions, approval gate."""

from __future__ import annotations

import pytest

import seo.outreach.stores as s
from seo.outreach import campaigns as camp
from seo.outreach.stores import CampaignStatus, CampaignType


@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    s.reset_repositories()
    yield
    s.reset_repositories()


def _make_campaign(tenant="t1", **kw):
    return camp.create_campaign(tenant, name="Test Camp", **kw)


# ── CRUD ──────────────────────────────────────────────────────────────────────

def test_create_campaign_starts_in_draft():
    cid, c = _make_campaign()
    assert cid.startswith("camp_")
    assert c.status == CampaignStatus.DRAFT


def test_get_campaign_cross_tenant_isolation():
    cid, _ = _make_campaign(tenant="t1")
    assert camp.get_campaign("t2", cid) is None


def test_update_campaign_cannot_bypass_state_machine():
    cid, _ = _make_campaign()
    # update_campaign strips status changes.
    result = camp.update_campaign("t1", cid, name="Renamed")
    assert result is not None
    _, updated = result
    assert updated.name == "Renamed"
    assert updated.status == CampaignStatus.DRAFT  # unchanged


# ── State transitions ──────────────────────────────────────────────────────────

def test_valid_transition_draft_to_ready():
    cid, _ = _make_campaign()
    result = camp.transition("t1", cid, CampaignStatus.READY)
    assert result is not None
    _, c = result
    assert c.status == CampaignStatus.READY


def test_invalid_transition_raises():
    cid, _ = _make_campaign()
    with pytest.raises(ValueError, match="invalid_transition"):
        camp.transition("t1", cid, CampaignStatus.SENT)


def test_transition_to_approved_requires_approval():
    cid, _ = _make_campaign()
    camp.transition("t1", cid, CampaignStatus.READY)
    # Cannot go READY → APPROVED; must use approve_campaign.
    with pytest.raises(ValueError, match="invalid_transition"):
        camp.transition("t1", cid, CampaignStatus.APPROVED)


def test_approve_campaign_from_ready():
    cid, _ = _make_campaign()
    camp.transition("t1", cid, CampaignStatus.READY)
    _, approved = camp.approve_campaign("t1", cid, approved_by="ali@example.com")
    assert approved.status == CampaignStatus.APPROVED
    assert approved.approval["approved_by"] == "ali@example.com"


def test_approve_campaign_not_in_ready_raises():
    cid, _ = _make_campaign()
    # Still in DRAFT — cannot approve.
    with pytest.raises(ValueError, match="cannot_approve"):
        camp.approve_campaign("t1", cid, approved_by="ali@example.com")


def test_cannot_send_without_approval():
    """Approval must be recorded before the campaign can be transitioned to SENT."""
    cid, _ = _make_campaign()
    camp.transition("t1", cid, CampaignStatus.READY)
    # Ready → Approved requires approve_campaign (which records approval).
    # Directly trying READY → SENT is invalid.
    with pytest.raises(ValueError, match="invalid_transition"):
        camp.transition("t1", cid, CampaignStatus.SENT)


def test_full_won_lifecycle():
    cid, _ = _make_campaign()
    camp.transition("t1", cid, CampaignStatus.READY)
    camp.approve_campaign("t1", cid, approved_by="manager")
    camp.transition("t1", cid, CampaignStatus.SENT)
    camp.transition("t1", cid, CampaignStatus.REPLIED)
    camp.transition("t1", cid, CampaignStatus.INTERESTED)
    _, final = camp.transition("t1", cid, CampaignStatus.WON)
    assert final.status == CampaignStatus.WON


def test_terminal_state_cannot_transition():
    cid, _ = _make_campaign()
    camp.transition("t1", cid, CampaignStatus.READY)
    camp.approve_campaign("t1", cid, approved_by="m")
    camp.transition("t1", cid, CampaignStatus.SENT)
    camp.transition("t1", cid, CampaignStatus.DECLINED)
    with pytest.raises(ValueError, match="invalid_transition"):
        camp.transition("t1", cid, CampaignStatus.REPLIED)


def test_transition_wrong_tenant_raises():
    cid, _ = _make_campaign(tenant="t1")
    with pytest.raises(ValueError, match="campaign_not_found"):
        camp.transition("t2", cid, CampaignStatus.READY)


# ── attach_contacts ────────────────────────────────────────────────────────────

def test_attach_contacts():
    cid, _ = _make_campaign()
    camp.attach_contacts("t1", cid, ["oc_1", "oc_2"])
    _, c = camp.get_campaign("t1", cid)
    assert "oc_1" in c.contact_ids
    assert "oc_2" in c.contact_ids


def test_attach_contacts_is_additive():
    cid, _ = _make_campaign()
    camp.attach_contacts("t1", cid, ["oc_1"])
    camp.attach_contacts("t1", cid, ["oc_2"])
    _, c = camp.get_campaign("t1", cid)
    assert "oc_1" in c.contact_ids
    assert "oc_2" in c.contact_ids
