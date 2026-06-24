"""The compliance gate — the whole point of the module.

`evaluate_gate(campaign, target)` runs ordered pre-send checks; the FIRST failure
short-circuits (marks blocked_by, stops). A send is only ever attempted when all
blocking checks pass AND the campaign is not in dry_run. This module never sends.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

from . import store
from .schemas import Campaign, CampaignChannel, CampaignStatus, CampaignTarget, GateCheck, GateResult


def contact_for(target: CampaignTarget, channel: CampaignChannel) -> str:
    return (target.email or "") if channel == CampaignChannel.EMAIL else (target.phone or "")


def _matches(rec, target: CampaignTarget) -> bool:
    """Does a consent/opt-out/dnc record refer to this target?"""
    return bool(
        (getattr(rec, "customer_id", None) and rec.customer_id == target.customer_id)
        or (getattr(rec, "phone", None) and target.phone and rec.phone == target.phone)
        or (getattr(rec, "email", None) and target.email and rec.email == target.email)
    )


def render_message(campaign: Campaign, target: CampaignTarget, channel: CampaignChannel) -> dict:
    """Render the body (merge vars + AI disclosure + opt-out footer for sms/email)."""
    body = campaign.message_template or f"Hello {{{{name}}}}, a quick note from your provider."
    merge = {"name": target.name or "there", **target.merge_vars}
    for k, v in merge.items():
        body = body.replace(f"{{{{{k}}}}}", str(v))
    body = re.sub(r"\{\{\w+\}\}", "", body).strip()  # drop unresolved placeholders

    parts = [body, campaign.ai_disclosure]
    if channel == CampaignChannel.SMS:
        parts.append("Reply STOP to opt out.")
    elif channel == CampaignChannel.EMAIL:
        parts.append("To unsubscribe, reply UNSUBSCRIBE.")
    full = "\n\n".join(p for p in parts if p)
    return {"channel": channel.value, "to": contact_for(target, channel),
            "subject": campaign.subject_template, "body": full}


def idempotency_key(campaign: Campaign, target: CampaignTarget, channel: CampaignChannel) -> str:
    bucket = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    raw = f"{campaign.id}|{contact_for(target, channel)}|{bucket}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def evaluate_gate(campaign: Campaign, target: CampaignTarget) -> GateResult:
    checks: list[GateCheck] = []
    channel = campaign.channels[0] if campaign.channels else CampaignChannel.SMS  # primary (fallback = later)
    tid = campaign.tenant_id

    def block(name: str, detail: str) -> GateResult:
        checks.append(GateCheck(name=name, passed=False, detail=detail))
        return GateResult(target_id=target.id, allowed=False, checks=checks, blocked_by=name, resolved_channel=channel)

    def ok(name: str, detail: str = "") -> None:
        checks.append(GateCheck(name=name, passed=True, detail=detail))

    # 1. consent
    need_marketing = campaign.requires_marketing_consent
    consents = [c for c in store.list_consent(tid) if c.channel == channel and c.granted and _matches(c, target)]
    if need_marketing:
        consents = [c for c in consents if c.consent_type == "marketing"]
    else:
        consents = [c for c in consents if c.consent_type in ("transactional", "marketing")]
    if not consents:
        return block("consent", f"no active {'marketing' if need_marketing else 'transactional'} consent for {channel.value}")
    ok("consent")

    # 2. opt-out
    for o in store.list_opt_outs(tid):
        if not _matches(o, target):
            continue
        if o.channel not in (None, channel):
            continue
        if o.scope == "all" or (o.scope == "marketing" and need_marketing):
            return block("opt_out", f"recipient opted out (scope={o.scope})")
    ok("opt_out")

    # 3. do-not-contact (hard, never overridable)
    for d in store.list_dnc(tid):
        if (d.phone and d.phone == target.phone) or (d.email and d.email == target.email):
            return block("dnc", f"on do-not-contact list ({d.reason})")
    ok("dnc")

    # 4. contact hours (recipient timezone)
    start, end = (campaign.voice_hours_start, campaign.voice_hours_end) if channel == CampaignChannel.VOICE \
        else (campaign.quiet_hours_start, campaign.quiet_hours_end)
    if ZoneInfo is None:  # no tz support → never guess with server time; fail-closed
        return block("contact_hours", "timezone support unavailable (fail-closed)")
    try:
        now_local = datetime.now(ZoneInfo(target.timezone))
    except Exception:
        return block("contact_hours", f"unknown timezone '{target.timezone}' (fail-closed)")
    if not (start <= now_local.hour < end):
        return block("contact_hours", f"{now_local.strftime('%H:%M')} {target.timezone} outside {start:02d}:00-{end:02d}:00")
    ok("contact_hours", f"{now_local.strftime('%H:%M')} {target.timezone}")

    # 5. frequency cap
    sent_recently = store.recent_send_count(tid, contact_for(target, channel), campaign.frequency_window_days)
    if sent_recently >= campaign.frequency_cap_per_window:
        return block("frequency_cap", f"{sent_recently} sends in {campaign.frequency_window_days}d (cap {campaign.frequency_cap_per_window})")
    ok("frequency_cap")

    # 6. campaign approved
    if campaign.status not in (CampaignStatus.APPROVED, CampaignStatus.RUNNING):
        return block("campaign_approved", f"status={campaign.status.value} (needs approved/running)")
    ok("campaign_approved")

    preview = render_message(campaign, target, channel)

    # 7. AI disclosure present
    if not campaign.ai_disclosure.strip() or campaign.ai_disclosure not in preview["body"]:
        return block("ai_disclosure", "AI disclosure missing from message")
    ok("ai_disclosure")

    # 8. opt-out instruction (sms/email)
    if channel in (CampaignChannel.SMS, CampaignChannel.EMAIL):
        if not re.search(r"stop|unsubscribe", preview["body"], re.IGNORECASE):
            return block("opt_out_instruction", "missing STOP/unsubscribe instruction")
    ok("opt_out_instruction")

    # 9. idempotency
    if store.key_already_logged(tid, idempotency_key(campaign, target, channel)):
        return block("idempotency", "already sent in this window")
    ok("idempotency")

    # 10. dry-run mode (informational — never blocks)
    ok("dry_run_mode", f"dry_run={campaign.dry_run}")

    return GateResult(target_id=target.id, allowed=True, checks=checks,
                      resolved_channel=channel, would_send_preview=preview)
