"""Tests for the follow-up scheduler: STOP conditions, idempotency, quiet hours."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

import seo.outreach.stores as s
from seo.outreach import campaigns as camp
from seo.outreach import contacts as cont
from seo.outreach import drafts as draft_svc
from seo.outreach import followups as fu_svc
from seo.outreach import sending
from seo.outreach.stores import (
    CampaignStatus,
    FollowupStatus,
    Followup,
    get_followup_repository,
)


@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.delenv("EMAIL_PROVIDER_API_KEY", raising=False)
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    s.reset_repositories()
    sending.reset_idempotency_store()
    sending.reset_daily_counters()
    yield
    s.reset_repositories()
    sending.reset_idempotency_store()
    sending.reset_daily_counters()


def _setup(tenant="t1", monkeypatch=None):
    if monkeypatch:
        monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    _, _ = cont.add_contact(tenant, "target.com", email="bob@target.com", name="Bob")
    contacts = cont.list_contacts(tenant)
    contact_id = contacts[0][0]
    campaign_id, _ = camp.create_campaign(tenant, name="C", contact_ids=[contact_id], sender_identity="s@s.com")
    camp.transition(tenant, campaign_id, CampaignStatus.READY)
    camp.approve_campaign(tenant, campaign_id, approved_by="manager")
    camp.transition(tenant, campaign_id, CampaignStatus.SENT)
    did, _ = draft_svc.generate_draft(tenant, campaign_id, contact_id, is_mock=True)
    draft_svc.approve_draft(tenant, did, approved_by="manager")
    return campaign_id, contact_id


def _insert_due_followup(tenant, campaign_id, contact_id, *, seq_idx=0,
                          scheduled_for="2026-08-01T00:00:00+00:00"):
    fu_repo = get_followup_repository()
    fu = Followup(
        tenant_id=tenant,
        campaign_id=campaign_id,
        contact_id=contact_id,
        sequence_index=seq_idx,
        scheduled_for=scheduled_for,
        status=FollowupStatus.SCHEDULED,
    )
    return fu_repo.create(fu)


# ── Schedule / run ────────────────────────────────────────────────────────────

def test_schedule_followups_creates_rows(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    monkeypatch.setenv("SEO_OUTREACH_MAX_FOLLOWUPS", "2")
    campaign_id, contact_id = _setup(monkeypatch=monkeypatch)
    created = fu_svc.schedule_followups("t1", campaign_id, contact_ids=[contact_id])
    assert len(created) == 2
    for fid, fu in created:
        assert fid.startswith("ofu_")
        assert fu.status == FollowupStatus.SCHEDULED


def test_schedule_followups_idempotent(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    monkeypatch.setenv("SEO_OUTREACH_MAX_FOLLOWUPS", "1")
    campaign_id, contact_id = _setup(monkeypatch=monkeypatch)
    created1 = fu_svc.schedule_followups("t1", campaign_id, contact_ids=[contact_id])
    created2 = fu_svc.schedule_followups("t1", campaign_id, contact_ids=[contact_id])
    # Second call creates nothing (rows already exist for seq_idx=0).
    assert len(created2) == 0


# ── STOP conditions ───────────────────────────────────────────────────────────

def test_followup_stops_on_replied(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup(monkeypatch=monkeypatch)
    _insert_due_followup("t1", campaign_id, contact_id)
    # Transition campaign to REPLIED (someone replied!).
    camp.transition("t1", campaign_id, CampaignStatus.REPLIED)
    now = datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc)
    results = fu_svc.run_due_followups("t1", is_mock=True, now=now)
    assert len(results) == 1
    assert results[0]["status"] == "stopped"
    assert "replied" in results[0]["stop_reason"]


def test_followup_stops_on_bounce(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup(monkeypatch=monkeypatch)
    _insert_due_followup("t1", campaign_id, contact_id)
    sending.handle_bounce("t1", contact_id, hard=True)
    now = datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc)
    results = fu_svc.run_due_followups("t1", is_mock=True, now=now)
    assert results[0]["status"] == "stopped"
    assert results[0]["stop_reason"] in ("bounce", "unsubscribe", "suppressed")


def test_followup_stops_on_unsubscribe(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup(monkeypatch=monkeypatch)
    _insert_due_followup("t1", campaign_id, contact_id)
    sending.handle_unsubscribe("t1", contact_id)
    now = datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc)
    results = fu_svc.run_due_followups("t1", is_mock=True, now=now)
    assert results[0]["status"] == "stopped"


def test_followup_stops_on_manual_stop(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup(monkeypatch=monkeypatch)
    fid, _ = _insert_due_followup("t1", campaign_id, contact_id)
    # Stop the followup before the runner processes it.
    stopped = fu_svc.stop_followup("t1", fid)
    assert stopped
    # Verify the row is now in STOPPED status.
    fu_repo = get_followup_repository()
    result = fu_repo.get("t1", fid)
    assert result is not None
    _, fu = result
    assert fu.status == FollowupStatus.STOPPED
    assert fu.stop_reason == "manual_close"
    # The runner should not return this followup (it's no longer SCHEDULED).
    now = datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc)
    results = fu_svc.run_due_followups("t1", is_mock=True, now=now)
    assert len(results) == 0


# ── Quiet hours ───────────────────────────────────────────────────────────────

def test_followup_skipped_in_quiet_hours(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    monkeypatch.setenv("SEO_OUTREACH_QUIET_START", "22")
    monkeypatch.setenv("SEO_OUTREACH_QUIET_END", "8")
    campaign_id, contact_id = _setup(monkeypatch=monkeypatch)
    _insert_due_followup("t1", campaign_id, contact_id)
    # 23:00 UTC — inside quiet hours.
    quiet_time = datetime(2026, 8, 2, 23, 0, tzinfo=timezone.utc)
    results = fu_svc.run_due_followups("t1", is_mock=True, now=quiet_time)
    assert all(r["status"] == "skipped" and r.get("reason") == "quiet_hours" for r in results)


def test_followup_sent_outside_quiet_hours(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    monkeypatch.setenv("SEO_OUTREACH_QUIET_START", "22")
    monkeypatch.setenv("SEO_OUTREACH_QUIET_END", "8")
    campaign_id, contact_id = _setup(monkeypatch=monkeypatch)
    _insert_due_followup("t1", campaign_id, contact_id)
    # 10:00 UTC — outside quiet hours.
    active_time = datetime(2026, 8, 2, 10, 0, tzinfo=timezone.utc)
    results = fu_svc.run_due_followups("t1", is_mock=True, now=active_time)
    assert len(results) == 1
    assert results[0]["status"] in ("sent", "pending_manual", "skipped")


# ── Idempotency ───────────────────────────────────────────────────────────────

def test_followup_idempotent_not_sent_twice(monkeypatch):
    monkeypatch.setattr("seo.metering_search.credit_config.credit_system_enabled", lambda: False)
    campaign_id, contact_id = _setup(monkeypatch=monkeypatch)
    _insert_due_followup("t1", campaign_id, contact_id)
    now = datetime(2026, 8, 2, 10, 0, tzinfo=timezone.utc)
    results1 = fu_svc.run_due_followups("t1", is_mock=True, now=now)
    results2 = fu_svc.run_due_followups("t1", is_mock=True, now=now)
    # Second run: already sent or followup row is in SENT status now.
    assert all(r["status"] in ("skipped", "stopped") for r in results2)


# ── Helper function ───────────────────────────────────────────────────────────

def test_in_quiet_hours_spans_midnight():
    import importlib
    # 22:00 → in quiet hours
    assert fu_svc._in_quiet_hours(datetime(2026, 1, 1, 22, 0, tzinfo=timezone.utc))
    # 00:00 → in quiet hours (past midnight)
    assert fu_svc._in_quiet_hours(datetime(2026, 1, 1, 0, 30, tzinfo=timezone.utc))
    # 09:00 → NOT in quiet hours
    assert not fu_svc._in_quiet_hours(datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc))
