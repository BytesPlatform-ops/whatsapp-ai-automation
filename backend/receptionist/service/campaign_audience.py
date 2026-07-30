"""Campaign audience segmentation, snapshot + eligibility engine (Parts 4-6).

Builds audiences ONLY from existing Pixie contact data via typed, operator-visible
rules (no scraping / purchased lists / hidden expansion). On approval it freezes a
durable snapshot of eligible recipients; execution always revalidates at send time.
The eligibility engine reuses the existing per-channel suppression/consent checks —
it never invents a second consent system.
"""

from __future__ import annotations

from typing import Optional

from . import stores
from .ids import new_id, now_iso

# eligibility result vocabulary (Part 6)
ELIGIBILITY = ("eligible", "missing_identity", "missing_consent", "suppressed", "dnc",
               "provider_unavailable", "provider_policy_blocked", "quiet_hours_delayed",
               "frequency_cap_blocked", "invalid_recipient", "plan_limit_reached",
               "approval_invalid", "campaign_paused", "duplicate", "manually_excluded")

_CHANNEL_IDENTITY = {
    "email": "email", "gmail": "email",
    "whatsapp": "phone", "sms": "phone", "voice": "phone", "voice_call": "phone", "voice_callback": "phone",
    "instagram": "meta", "messenger": "meta", "telegram": "telegram",
}


def _norm_phone(p: str) -> str:
    from ..providers.sms_adapter import normalise_e164
    return normalise_e164(p or "")


# ── segmentation (typed rules only) ───────────────────────────────────────────

def build_segment(tenant_id: str, rule: dict) -> list[dict]:
    """Return contacts matching a typed rule. Supported keys: contact_ids, tag,
    stage, source, service_interest, booking_status, preferred_channel."""
    rule = rule or {}
    contacts = stores.contacts().list(tenant_id)
    ids = set(rule.get("contact_ids") or [])
    out = []
    for c in contacts:
        if ids and c.get("id") not in ids:
            continue
        if rule.get("tag") and rule["tag"] not in (c.get("tags") or []):
            continue
        if rule.get("stage") and c.get("stage") != rule["stage"]:
            continue
        if rule.get("source") and c.get("source") != rule["source"]:
            continue
        if rule.get("service_interest") and c.get("service_interest") != rule["service_interest"]:
            continue
        if rule.get("preferred_channel") and c.get("preferred_channel") != rule["preferred_channel"]:
            continue
        out.append(c)
    return out


def estimate(tenant_id: str, campaign: dict) -> dict:
    """Operator-facing audience estimate with eligibility breakdown (no send)."""
    contacts = build_segment(tenant_id, campaign.get("audience_rule") or {})
    exclusions = set(campaign.get("exclusions") or [])
    channels = campaign.get("channels") or _step_channels(tenant_id, campaign["id"])
    breakdown: dict[str, int] = {}
    eligible = 0
    seen = set()
    for c in contacts:
        if c.get("id") in seen:
            continue
        seen.add(c.get("id"))
        if c.get("id") in exclusions:
            breakdown["manually_excluded"] = breakdown.get("manually_excluded", 0) + 1
            continue
        res = evaluate_eligibility(tenant_id, campaign, c, channels[0] if channels else "sms")
        breakdown[res["status"]] = breakdown.get(res["status"], 0) + 1
        if res["status"] == "eligible":
            eligible += 1
    return {"total": len(seen), "eligible": eligible, "breakdown": breakdown, "channels": channels}


def _step_channels(tenant_id: str, campaign_id: str) -> list[str]:
    from . import campaigns
    chans = [s["channel"] for s in campaigns.list_steps(tenant_id, campaign_id)
             if s["channel"] in _CHANNEL_IDENTITY]
    return list(dict.fromkeys(chans))


# ── eligibility (reuses existing per-channel suppression/consent) ─────────────

def _identity_for(tenant_id: str, contact: dict, channel: str) -> Optional[str]:
    kind = _CHANNEL_IDENTITY.get(channel)
    if kind == "email":
        return contact.get("email") or None
    if kind == "phone":
        return _norm_phone(contact.get("phone", "")) or None
    if kind == "meta":
        for row in stores.meta_identity_map().list(tenant_id):
            if row.get("contact_id") == contact.get("id"):
                return row.get("sender_id")
        return None
    if kind == "telegram":
        for row in stores.tg_identity_map().list(tenant_id):
            if row.get("contact_id") == contact.get("id"):
                return row.get("chat_id")
        return None
    return None


def _is_suppressed(tenant_id: str, channel: str, identity: str) -> bool:
    try:
        if channel in ("whatsapp",):
            from . import whatsapp_sync
            return whatsapp_sync.is_suppressed(tenant_id, identity)
        if channel in ("sms",):
            from . import sms_sync
            return sms_sync.is_suppressed(tenant_id, identity)
        if channel in ("instagram", "messenger"):
            from . import meta_messaging_sync
            return meta_messaging_sync.is_suppressed(tenant_id, channel, identity)
        if channel in ("telegram",):
            from . import telegram_sync
            return telegram_sync.is_suppressed(tenant_id, identity)
        if channel in ("voice", "voice_call", "voice_callback"):
            from . import voice_policy
            return voice_policy.is_suppressed(tenant_id, identity)
        if channel in ("email", "gmail"):
            from ..providers.sms_adapter import normalise_e164  # noqa
            n = (identity or "").strip().lower()
            for row in stores.optouts().list(tenant_id):
                if (row.get("email") or "").strip().lower() == n and row.get("status") != "revoked":
                    return True
            return False
    except Exception:
        return False
    return False


def _has_consent(tenant_id: str, contact: dict, purpose: str) -> bool:
    """Promotional purpose requires an explicit consent record; transactional/support/
    booking/follow-up rely on the existing customer relationship (an inbound identity)."""
    if purpose != "promotional":
        return True
    for row in stores.consent().list(tenant_id):
        if row.get("contact_id") == contact.get("id") and row.get("purpose") in ("promotional", "marketing") \
                and row.get("granted", True):
            return True
    return False


def evaluate_eligibility(tenant_id: str, campaign: dict, contact: dict, channel: str) -> dict:
    """Return {status, reason} — never sends, never charges."""
    from . import campaign_execution
    if campaign.get("status") == "paused":
        return {"status": "campaign_paused", "reason": "campaign_paused"}
    if contact.get("id") in set(campaign.get("exclusions") or []):
        return {"status": "manually_excluded", "reason": "excluded"}
    identity = _identity_for(tenant_id, contact, channel)
    if not identity:
        return {"status": "missing_identity", "reason": f"no_{channel}_identity"}
    if not _has_consent(tenant_id, contact, campaign.get("purpose", "support")):
        return {"status": "missing_consent", "reason": "promotional_consent_required"}
    if _is_suppressed(tenant_id, channel, identity):
        return {"status": "suppressed", "reason": "suppressed_or_dnc"}
    cap = campaign_execution.frequency_check(tenant_id, campaign, contact.get("id", ""), channel, commit=False)
    if not cap["allowed"]:
        return {"status": "frequency_cap_blocked", "reason": cap.get("reason", "cap")}
    return {"status": "eligible", "reason": "", "identity": identity}


# ── snapshot ──────────────────────────────────────────────────────────────────

def create_snapshot(tenant_id: str, campaign: dict) -> dict:
    """Freeze a durable audience snapshot of eligible recipients (deduped)."""
    snap_id = new_id("cmpsnap")
    contacts = build_segment(tenant_id, campaign.get("audience_rule") or {})
    channels = _step_channels(tenant_id, campaign["id"]) or (campaign.get("channels") or ["sms"])
    version = int(campaign.get("version", 1))
    included, excluded, seen = 0, 0, set()
    for c in contacts:
        cid = c.get("id")
        if cid in seen:
            continue
        seen.add(cid)
        primary = channels[0]
        res = evaluate_eligibility(tenant_id, campaign, c, primary)
        rec = {
            "id": f"cmprcpt::{tenant_id}::{campaign['id']}::{cid}", "tenant_id": tenant_id,
            "campaign_id": campaign["id"], "snapshot_id": snap_id, "contact_id": cid,
            "channel": primary, "identity": res.get("identity", ""),
            "eligibility": res["status"], "inclusion_reason": "segment_match",
            "exclusion_reason": "" if res["status"] == "eligible" else res["reason"],
            "state": "pending" if res["status"] == "eligible" else "eligibility_blocked",
            "campaign_version": version, "current_step": 0, "attempts": 0,
            "created_at": now_iso(), "updated_at": now_iso()}
        stores.cmp_recipients().put(tenant_id, rec)
        if res["status"] == "eligible":
            included += 1
        else:
            excluded += 1
    snap = {"id": snap_id, "tenant_id": tenant_id, "campaign_id": campaign["id"],
            "campaign_version": version, "included": included, "excluded": excluded,
            "total": len(seen), "channels": channels, "created_at": now_iso()}
    stores.cmp_snapshots().put(tenant_id, snap)
    from . import campaigns
    campaigns.audit(tenant_id, campaign["id"], "snapshot_created",
                    detail={"included": included, "excluded": excluded})
    return snap


def list_recipients(tenant_id: str, campaign_id: str) -> list[dict]:
    return [r for r in stores.cmp_recipients().list(tenant_id) if r.get("campaign_id") == campaign_id]


def get_recipient(tenant_id: str, campaign_id: str, contact_id: str) -> Optional[dict]:
    return stores.cmp_recipients().get(tenant_id, f"cmprcpt::{tenant_id}::{campaign_id}::{contact_id}")
