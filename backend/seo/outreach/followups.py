"""Durable follow-up scheduler for SEO outreach.

Design: this module exposes a CALLABLE (run_due_followups) that a scheduler
(cron, APScheduler, background task) invokes. No live loop runs inside this
module.

Rules:
- Configurable delay: SEO_OUTREACH_FOLLOWUP_INTERVAL_SECONDS (default 3 days).
- Max follow-ups per campaign+contact: SEO_OUTREACH_MAX_FOLLOWUPS (default 2).
- STOP conditions (checked before every send):
    reply   → campaign.status in (REPLIED, INTERESTED, WON, DECLINED)
    unsubscribe → contact.do_not_contact or suppressed
    bounce  → contact.bounce_status == HARD
    manual_close → followup.status == STOPPED
- Per-workspace daily send limit reused from sending.py.
- Quiet hours/timezone: SEO_OUTREACH_QUIET_HOURS_TZ (default UTC),
  SEO_OUTREACH_QUIET_START (default 22), SEO_OUTREACH_QUIET_END (default 8).
  Sending is skipped (rescheduled to next allowed window) when in quiet hours.
- IDEMPOTENT: a followup row with status SENT is never re-sent.
- Job recovery: scheduled_for is durable; the runner picks up past-due items.

Metering: uses record_email_send from metering_search (zero when is_mock=True).
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from seo.stores import _now

from .sending import (
    _already_sent,
    _daily_limit,
    _get_daily_count,
    _mark_sent,
    _increment_daily,
    _provider_configured,
    _send_via_provider,
    get_approved_draft,
    reset_idempotency_store,  # noqa: F401 — re-export for tests
    reset_daily_counters,     # noqa: F401 — re-export for tests
)
from .stores import (
    BounceStatus,
    CampaignStatus,
    Followup,
    FollowupStatus,
    get_campaign_repository,
    get_contact_repository,
    get_followup_repository,
    get_suppression_repository,
)

_log = logging.getLogger("pixie.seo.outreach.followups")

# ── Config ────────────────────────────────────────────────────────────────────

_DEFAULT_FOLLOWUP_INTERVAL = 3 * 24 * 3600   # 3 days in seconds
_DEFAULT_MAX_FOLLOWUPS = 2


def _followup_interval() -> int:
    try:
        return int(os.getenv("SEO_OUTREACH_FOLLOWUP_INTERVAL_SECONDS", str(_DEFAULT_FOLLOWUP_INTERVAL)))
    except (ValueError, TypeError):
        return _DEFAULT_FOLLOWUP_INTERVAL


def _max_followups() -> int:
    try:
        return int(os.getenv("SEO_OUTREACH_MAX_FOLLOWUPS", str(_DEFAULT_MAX_FOLLOWUPS)))
    except (ValueError, TypeError):
        return _DEFAULT_MAX_FOLLOWUPS


def _quiet_tz() -> str:
    return os.getenv("SEO_OUTREACH_QUIET_HOURS_TZ", "UTC")


def _quiet_start() -> int:
    try:
        return int(os.getenv("SEO_OUTREACH_QUIET_START", "22"))
    except (ValueError, TypeError):
        return 22


def _quiet_end() -> int:
    try:
        return int(os.getenv("SEO_OUTREACH_QUIET_END", "8"))
    except (ValueError, TypeError):
        return 8


def _in_quiet_hours(dt: Optional[datetime] = None) -> bool:
    """Return True when the current UTC hour is in the quiet window.

    The quiet window may span midnight (e.g. 22:00–08:00).
    Timezone support is simplified to UTC for the in-process scheduler
    (a production deployment would use pytz/zoneinfo).
    """
    now = dt or datetime.now(timezone.utc)
    hour = now.hour
    start = _quiet_start()
    end = _quiet_end()
    if start > end:  # spans midnight
        return hour >= start or hour < end
    else:
        return start <= hour < end


# ── Stop-condition check ──────────────────────────────────────────────────────

def _should_stop(
    tenant_id: str,
    campaign_id: str,
    contact_id: str,
    followup_id: str,
) -> Optional[str]:
    """Return a stop_reason string if the follow-up should NOT be sent, else None."""
    camp_repo = get_campaign_repository()
    contact_repo = get_contact_repository()
    supp_repo = get_suppression_repository()
    fu_repo = get_followup_repository()

    # Check followup status.
    fu_result = fu_repo.get(tenant_id, followup_id)
    if fu_result:
        _, fu = fu_result
        if fu.status == FollowupStatus.STOPPED:
            return "manual_close"

    # Campaign terminal/replied states.
    camp_result = camp_repo.get(tenant_id, campaign_id)
    if not camp_result:
        return "campaign_not_found"
    _, campaign = camp_result
    if campaign.status in (
        CampaignStatus.REPLIED,
        CampaignStatus.INTERESTED,
        CampaignStatus.WON,
        CampaignStatus.DECLINED,
        CampaignStatus.BOUNCED,
        CampaignStatus.UNSUBSCRIBED,
    ):
        return f"campaign_status_{campaign.status.value}"

    # Contact do-not-contact / bounce / suppression.
    contact_result = contact_repo.get(tenant_id, contact_id)
    if not contact_result:
        return "contact_not_found"
    _, contact = contact_result
    if contact.do_not_contact:
        return "unsubscribe"
    if contact.bounce_status == BounceStatus.HARD:
        return "bounce"
    if contact.email and supp_repo.is_suppressed(tenant_id, contact.email):
        return "suppressed"

    return None


# ── Schedule follow-ups for a campaign ────────────────────────────────────────

def schedule_followups(
    tenant_id: str,
    campaign_id: str,
    *,
    contact_ids: Optional[List[str]] = None,
) -> List[Tuple[str, Followup]]:
    """Schedule follow-up rows for a campaign's contacts after the initial send.

    Creates one Followup row per (contact, sequence_index) up to max_followups.
    Idempotent: skips contacts that already have followup rows for this campaign.

    Returns the list of created followup (id, Followup) pairs.
    """
    from seo.metering_search import LIMIT_OUTREACH_FOLLOWUPS, enforce_seo_limit

    camp_result = get_campaign_repository().get(tenant_id, campaign_id)
    if not camp_result:
        raise ValueError(f"campaign_not_found: {campaign_id!r}")
    _, campaign = camp_result

    targets = contact_ids or campaign.contact_ids
    fu_repo = get_followup_repository()
    max_fu = _max_followups()
    interval = _followup_interval()

    created = []
    for cid in targets:
        # Check existing followups for this contact+campaign.
        existing = fu_repo.list_by_campaign(tenant_id, campaign_id)
        existing_indices = {fu.sequence_index for _, fu in existing if fu.contact_id == cid}

        for seq_idx in range(max_fu):
            if seq_idx in existing_indices:
                continue

            # Plan limit.
            all_fus = fu_repo.list(tenant_id)
            try:
                enforce_seo_limit(tenant_id, LIMIT_OUTREACH_FOLLOWUPS, len(all_fus))
            except Exception:
                break

            delay = timedelta(seconds=interval * (seq_idx + 1))
            scheduled_for = (datetime.now(timezone.utc) + delay).isoformat()

            fu = Followup(
                tenant_id=tenant_id,
                campaign_id=campaign_id,
                contact_id=cid,
                sequence_index=seq_idx,
                scheduled_for=scheduled_for,
                status=FollowupStatus.SCHEDULED,
            )
            fu_id, saved_fu = fu_repo.create(fu)
            created.append((fu_id, saved_fu))

    return created


# ── Runner ────────────────────────────────────────────────────────────────────

def run_due_followups(
    tenant_id: str,
    *,
    is_mock: bool = True,
    now: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """Send all due follow-ups for a tenant. Called by a scheduler.

    Args:
        tenant_id: workspace to process.
        is_mock: when True, no real sends + zero metering.
        now: override the current time (useful in tests).

    Returns a list of result dicts per followup attempted.
    """
    from seo.metering_search import record_email_send

    current_time = now or datetime.now(timezone.utc)
    now_iso = current_time.isoformat()

    fu_repo = get_followup_repository()
    contact_repo = get_contact_repository()
    camp_repo = get_campaign_repository()

    due = fu_repo.list_scheduled(tenant_id, now_iso)
    results = []

    for fu_id, fu in due:
        result: Dict[str, Any] = {
            "followup_id": fu_id,
            "campaign_id": fu.campaign_id,
            "contact_id": fu.contact_id,
            "sequence_index": fu.sequence_index,
        }

        # Stop conditions.
        stop = _should_stop(tenant_id, fu.campaign_id, fu.contact_id, fu_id)
        if stop:
            fu_repo.update(
                tenant_id, fu_id,
                status=FollowupStatus.STOPPED,
                stop_reason=stop,
            )
            result.update({"status": "stopped", "stop_reason": stop})
            results.append(result)
            continue

        # Quiet hours.
        if _in_quiet_hours(current_time):
            result.update({"status": "skipped", "reason": "quiet_hours"})
            results.append(result)
            continue

        # Daily rate limit.
        if _get_daily_count(tenant_id) >= _daily_limit():
            result.update({"status": "skipped", "reason": "daily_rate_limit"})
            results.append(result)
            continue

        # Idempotency.
        if _already_sent(tenant_id, fu.campaign_id, fu.contact_id, fu.sequence_index):
            fu_repo.update(tenant_id, fu_id, status=FollowupStatus.SENT, sent_at=_now())
            result.update({"status": "skipped", "reason": "already_sent"})
            results.append(result)
            continue

        # Get approved draft.
        draft_result = get_approved_draft(tenant_id, fu.campaign_id, fu.contact_id)
        if not draft_result:
            result.update({"status": "skipped", "reason": "no_approved_draft"})
            results.append(result)
            continue
        draft_id, draft = draft_result

        # Fetch contact email.
        contact_result = contact_repo.get(tenant_id, fu.contact_id)
        if not contact_result:
            result.update({"status": "skipped", "reason": "contact_not_found"})
            results.append(result)
            continue
        _, contact = contact_result

        # Fetch campaign sender identity.
        camp_result = camp_repo.get(tenant_id, fu.campaign_id)
        _, campaign = camp_result if camp_result else (None, None)
        sender = campaign.sender_identity if campaign else ""

        # Send.
        if _provider_configured() and not is_mock:
            send_result = _send_via_provider(
                to_email=contact.email,
                from_identity=sender,
                subject=f"Re: {draft.subject}" if fu.sequence_index > 0 else draft.subject,
                body=draft.body,
                tenant_id=tenant_id,
            )
            send_status = send_result.get("status", "error")
        else:
            send_status = "pending_manual"
            send_result = {"status": "pending_manual", "mode": "manual"}

        if send_status in ("success", "pending_manual"):
            _mark_sent(tenant_id, fu.campaign_id, fu.contact_id, fu.sequence_index)
            _increment_daily(tenant_id)
            fu_repo.update(tenant_id, fu_id, status=FollowupStatus.SENT, sent_at=_now())
            record_email_send(tenant_id, campaign_id=fu.campaign_id, email_count=1, is_mock=is_mock)
            result.update({"status": "sent", "draft_id": draft_id, "mode": send_result.get("mode", "")})
        else:
            result.update({"status": "error", "reason": send_result.get("reason", "")})

        results.append(result)

    return results


def stop_followup(tenant_id: str, followup_id: str, *, reason: str = "manual_close") -> bool:
    """Manually stop a scheduled followup."""
    result = get_followup_repository().update(
        tenant_id, followup_id,
        status=FollowupStatus.STOPPED,
        stop_reason=reason,
    )
    return result is not None


def list_followups(tenant_id: str, campaign_id: str) -> List[Tuple[str, Followup]]:
    return get_followup_repository().list_by_campaign(tenant_id, campaign_id)
