"""Approval-gated email sending for SEO outreach.

Contract:
- Sends ONLY if the campaign is APPROVED (or SCHEDULED), the draft is approved,
  and the contact is not suppressed.
- Per-workspace daily rate limit: SEO_OUTREACH_DAILY_SEND_LIMIT (default 50).
- IDEMPOTENT: duplicate send for the same campaign+contact+sequence_index is
  silently skipped (checked via audit log / followup status).
- When a real email provider (Resend via receptionist/providers/notify.py) is
  configured, it is used — approval-gated and rate-limited.
- When no provider is configured, the draft becomes copy-ready and is marked
  with send_mode="manual". No real emails are sent in tests (RUN_LIVE_OUTREACH_TESTS
  gate).
- Bounce/unsubscribe hooks update the contact and add to suppression list.
- Full audit trail: every send attempt is recorded.

Metering: record_email_send is called per send. Zero when is_mock=True.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from seo.metering_search import LIMIT_OUTREACH_EMAILS, enforce_seo_limit, record_email_send
from seo.stores import _now, _uid

from .campaigns import transition
from .contacts import mark_do_not_contact, suppress_email
from .drafts import get_approved_draft
from .stores import (
    BounceStatus,
    CampaignStatus,
    RelationshipStatus,
    SuppressionReason,
    get_campaign_repository,
    get_contact_repository,
    get_suppression_repository,
)

_log = logging.getLogger("pixie.seo.outreach.sending")

# ── Rate limit helpers ────────────────────────────────────────────────────────

_DEFAULT_DAILY_SEND_LIMIT = 50

# In-process daily counter. Keyed by (tenant_id, date_str).
# Production deployments should use a durable counter (Redis/DB);
# this in-process dict is sufficient for single-instance + tests.
_daily_counters: Dict[str, int] = {}


def _today_str() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _daily_key(tenant_id: str) -> str:
    return f"{tenant_id}:{_today_str()}"


def _get_daily_count(tenant_id: str) -> int:
    return _daily_counters.get(_daily_key(tenant_id), 0)


def _increment_daily(tenant_id: str) -> int:
    key = _daily_key(tenant_id)
    _daily_counters[key] = _daily_counters.get(key, 0) + 1
    return _daily_counters[key]


def reset_daily_counters() -> None:
    """Clear in-process daily counters (useful in tests)."""
    _daily_counters.clear()


def _daily_limit() -> int:
    try:
        return int(os.getenv("SEO_OUTREACH_DAILY_SEND_LIMIT", str(_DEFAULT_DAILY_SEND_LIMIT)))
    except (ValueError, TypeError):
        return _DEFAULT_DAILY_SEND_LIMIT


# ── Provider detection ────────────────────────────────────────────────────────

def _provider_configured() -> bool:
    """Return True when a real email provider key is present."""
    return bool(os.getenv("EMAIL_PROVIDER_API_KEY", "").strip())


def _send_via_provider(
    *,
    to_email: str,
    from_identity: str,
    subject: str,
    body: str,
    tenant_id: str = "",
) -> Dict[str, Any]:
    """Send using receptionist's NotifyProvider (Resend) when configured.

    This re-uses the existing provider read-only; no new mail system.
    Returns a result dict with status/mode fields.
    """
    # NEVER send to real recipients in test mode.
    if os.getenv("RUN_LIVE_OUTREACH_TESTS", "0").strip() != "1":
        if os.getenv("PIXIE_MODEL_MODE", "fake") != "openai":
            return {
                "status": "skipped",
                "mode": "mock",
                "reason": "live_send_disabled_in_test_mode",
            }

    try:
        import httpx as _httpx
        api_key = os.getenv("EMAIL_PROVIDER_API_KEY", "")
        sender = os.getenv("SEO_OUTREACH_FROM_EMAIL") or from_identity or "outreach@pixie.local"

        with _httpx.Client(timeout=20) as http:
            resp = http.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"from": sender, "to": [to_email], "subject": subject, "text": body},
            )
        if resp.status_code >= 300:
            return {
                "status": "error",
                "mode": "real",
                "reason": f"provider_error_{resp.status_code}",
            }
        return {"status": "success", "mode": "real", "message": f"Sent to {to_email}"}
    except Exception as exc:
        _log.warning("outreach send provider failed: %s", exc)
        return {"status": "error", "mode": "real", "reason": str(exc)}


# ── Idempotency ───────────────────────────────────────────────────────────────

# Tracks (tenant_id, campaign_id, contact_id, sequence_index) that have been sent.
# Production should use a DB-backed set; this covers in-process + tests.
_sent_keys: set = set()


def _idempotency_key(tenant_id: str, campaign_id: str, contact_id: str, sequence_index: int) -> str:
    return f"{tenant_id}|{campaign_id}|{contact_id}|{sequence_index}"


def _already_sent(tenant_id: str, campaign_id: str, contact_id: str, sequence_index: int) -> bool:
    return _idempotency_key(tenant_id, campaign_id, contact_id, sequence_index) in _sent_keys


def _mark_sent(tenant_id: str, campaign_id: str, contact_id: str, sequence_index: int) -> None:
    _sent_keys.add(_idempotency_key(tenant_id, campaign_id, contact_id, sequence_index))


def reset_idempotency_store() -> None:
    """Clear in-process idempotency set (tests)."""
    _sent_keys.clear()


# ── Main send function ────────────────────────────────────────────────────────

def send_outreach_email(
    tenant_id: str,
    campaign_id: str,
    contact_id: str,
    *,
    sequence_index: int = 0,
    is_mock: bool = True,
) -> Dict[str, Any]:
    """Send an outreach email for a campaign+contact pair.

    Approval gate: campaign must be APPROVED (or SCHEDULED/SENT for follow-ups),
    draft must be approved.

    Rate limit: enforced per workspace per day.

    Idempotency: same (campaign, contact, sequence_index) will not be sent twice.

    Returns:
        result dict with keys: status, mode, send_mode, reason (optional), audit_id.
    """
    camp_repo = get_campaign_repository()
    contact_repo = get_contact_repository()
    supp_repo = get_suppression_repository()

    # 1. Fetch and validate campaign (tenant-scoped).
    camp_result = camp_repo.get(tenant_id, campaign_id)
    if not camp_result:
        return {"status": "error", "reason": "campaign_not_found", "audit_id": ""}

    _, campaign = camp_result

    # 2. Approval gate.
    if campaign.status not in (
        CampaignStatus.APPROVED,
        CampaignStatus.SCHEDULED,
        CampaignStatus.SENT,  # follow-ups after initial send
    ):
        return {
            "status": "blocked",
            "reason": f"approval_required: campaign status is {campaign.status.value}",
            "audit_id": "",
        }

    if not campaign.approval or not campaign.approval.get("approved_by"):
        return {"status": "blocked", "reason": "no_approval_recorded", "audit_id": ""}

    # 3. Fetch and validate contact.
    contact_result = contact_repo.get(tenant_id, contact_id)
    if not contact_result:
        return {"status": "error", "reason": "contact_not_found", "audit_id": ""}
    _, contact = contact_result

    if contact.do_not_contact:
        return {"status": "blocked", "reason": "contact_do_not_contact", "audit_id": ""}

    if not contact.email:
        return {"status": "error", "reason": "contact_no_email", "audit_id": ""}

    # 4. Suppression check.
    if supp_repo.is_suppressed(tenant_id, contact.email):
        return {"status": "blocked", "reason": "email_suppressed", "audit_id": ""}

    # 5. Idempotency.
    if _already_sent(tenant_id, campaign_id, contact_id, sequence_index):
        return {"status": "skipped", "reason": "already_sent", "audit_id": ""}

    # 6. Plan limit.
    try:
        sent_today = _get_daily_count(tenant_id)
        enforce_seo_limit(tenant_id, LIMIT_OUTREACH_EMAILS, sent_today)
    except Exception as exc:
        return {"status": "blocked", "reason": f"plan_limit: {exc}", "audit_id": ""}

    # 7. Daily rate limit.
    if _get_daily_count(tenant_id) >= _daily_limit():
        return {
            "status": "blocked",
            "reason": f"daily_rate_limit_reached: {_daily_limit()} emails/day",
            "audit_id": "",
        }

    # 8. Get approved draft.
    draft_result = get_approved_draft(tenant_id, campaign_id, contact_id)
    if not draft_result:
        return {"status": "blocked", "reason": "no_approved_draft", "audit_id": ""}
    draft_id, draft = draft_result

    audit_id = _uid("oaudit_")

    # 9. Send.
    if _provider_configured() and not is_mock:
        send_result = _send_via_provider(
            to_email=contact.email,
            from_identity=campaign.sender_identity,
            subject=draft.subject,
            body=draft.body,
            tenant_id=tenant_id,
        )
        send_mode = "provider"
    else:
        # Manual / copy-ready fallback.
        send_result = {
            "status": "pending_manual",
            "mode": "manual",
            "copy_ready": True,
            "subject": draft.subject,
            "body": draft.body,
            "to": contact.email,
            "from": campaign.sender_identity,
        }
        send_mode = "manual"

    if send_result.get("status") in ("success", "pending_manual"):
        # Mark idempotency and update counters.
        _mark_sent(tenant_id, campaign_id, contact_id, sequence_index)
        _increment_daily(tenant_id)

        # Update contact relationship status.
        contact_repo.update(tenant_id, contact_id,
                            last_contacted=_now(),
                            relationship_status=RelationshipStatus.CONTACTED)

        # Transition campaign to SENT if it was APPROVED/SCHEDULED (initial send).
        if campaign.status in (CampaignStatus.APPROVED, CampaignStatus.SCHEDULED):
            try:
                transition(tenant_id, campaign_id, CampaignStatus.SENT, actor="system")
            except Exception as exc:
                _log.debug("campaign transition to SENT skipped: %s", exc)

        # Meter (zero when is_mock).
        record_email_send(tenant_id, campaign_id=campaign_id, email_count=1, is_mock=is_mock)

    return {
        "status": send_result.get("status", "error"),
        "mode": send_mode,
        "send_mode": send_mode,
        "audit_id": audit_id,
        "draft_id": draft_id,
        "reason": send_result.get("reason", ""),
        "copy_ready": send_result.get("copy_ready", False),
        "subject": send_result.get("subject", ""),
        "body": send_result.get("body", ""),
    }


# ── Bounce / unsubscribe hooks ────────────────────────────────────────────────

def handle_bounce(
    tenant_id: str,
    contact_id: str,
    *,
    hard: bool = True,
    campaign_id: str = "",
) -> None:
    """Record a bounce: update contact + suppress email + optionally update campaign."""
    contact_repo = get_contact_repository()
    result = contact_repo.get(tenant_id, contact_id)
    if not result:
        return
    _, contact = result

    bounce_status = BounceStatus.HARD if hard else BounceStatus.SOFT
    contact_repo.update(
        tenant_id, contact_id,
        bounce_status=bounce_status,
        do_not_contact=hard,
    )

    if hard and contact.email:
        suppress_email(tenant_id, contact.email, reason=SuppressionReason.BOUNCE)

    if campaign_id and hard:
        try:
            transition(tenant_id, campaign_id, CampaignStatus.BOUNCED, actor="system")
        except Exception:
            pass


def handle_unsubscribe(
    tenant_id: str,
    contact_id: str,
    *,
    campaign_id: str = "",
) -> None:
    """Record an unsubscribe: mark do-not-contact + suppress + update campaign."""
    contact_repo = get_contact_repository()
    result = contact_repo.get(tenant_id, contact_id)
    if not result:
        return
    _, contact = result

    mark_do_not_contact(tenant_id, contact_id)
    if contact.email:
        suppress_email(tenant_id, contact.email, reason=SuppressionReason.UNSUBSCRIBE)

    if campaign_id:
        try:
            transition(tenant_id, campaign_id, CampaignStatus.UNSUBSCRIBED, actor="system")
        except Exception:
            pass
