"""Provider messaging policy for Instagram + Messenger (one service, two profiles).

Server-authoritative — no timing/tag rules scattered in handlers or the UI. A
verified inbound customer message opens a standard messaging window (24h under
current Meta rules) during which free-form replies are allowed. Outside it,
free-form is blocked; Messenger permits a small set of standard message tags,
Instagram does not. State is durable and versioned so a provider-rule change is a
config bump, not an engine rewrite. The frontend and model can never override it.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from . import stores
from .ids import now_iso

WINDOW_HOURS = 24

# Standard message tags Meta still supports for outside-window Messenger sends.
MESSENGER_TAGS = {"CONFIRMED_EVENT_UPDATE", "POST_PURCHASE_UPDATE", "ACCOUNT_UPDATE", "HUMAN_AGENT"}
# Instagram has no standard-tag equivalent — outside the window, no automated send.
INSTAGRAM_TAGS: set[str] = set()


def policy_version() -> str:
    return os.environ.get("AI_RECEPTIONIST_META_MESSAGING_POLICY_VERSION", "meta-policy-1") or "meta-policy-1"


def _allowed_tags(channel: str) -> set:
    return MESSENGER_TAGS if channel == "messenger" else INSTAGRAM_TAGS


def _key(tenant_id: str, channel: str, asset_id: str, sender_id: str) -> str:
    from ..providers.meta_messaging_common import normalise_psid
    return f"metaw::{tenant_id}::{channel}::{asset_id}::{normalise_psid(sender_id)}"


def record_inbound(tenant_id: str, *, channel: str, asset_id: str, sender_id: str,
                   ts: Optional[str] = None) -> dict:
    """A verified inbound customer message (re)opens the window from ``ts``."""
    ts = ts or now_iso()
    rid = _key(tenant_id, channel, asset_id, sender_id)
    rec = {"id": rid, "tenant_id": tenant_id, "channel": channel, "asset_id": asset_id,
           "sender_id": sender_id, "opened_at": ts, "last_inbound_at": ts,
           "policy_version": policy_version(), "updated_at": now_iso()}
    return stores.meta_windows().put(tenant_id, rec)


def _parse(iso: str) -> Optional[datetime]:
    try:
        dt = datetime.fromisoformat((iso or "").replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None


def window_state(tenant_id: str, *, channel: str, asset_id: str, sender_id: str,
                 now: Optional[datetime] = None) -> dict:
    """Current window state. Free-form is permitted only inside an open window."""
    now = now or datetime.now(timezone.utc)
    base = {"channel": channel, "policy_version": policy_version(),
            "allowed_tags": sorted(_allowed_tags(channel))}
    rec = stores.meta_windows().get(tenant_id, _key(tenant_id, channel, asset_id, sender_id))
    if rec is None:
        return {**base, "open": False, "free_form_allowed": False,
                "tag_required": bool(_allowed_tags(channel)), "opened_at": "", "expires_at": "",
                "reason": "no_inbound_window"}
    opened = _parse(rec.get("last_inbound_at") or rec.get("opened_at", ""))
    if opened is None:
        return {**base, "open": False, "free_form_allowed": False,
                "tag_required": bool(_allowed_tags(channel)), "opened_at": "", "expires_at": "",
                "reason": "unparseable_window"}
    expires = opened + timedelta(hours=WINDOW_HOURS)
    is_open = now < expires
    return {**base, "open": is_open, "free_form_allowed": is_open,
            "tag_required": (not is_open) and bool(_allowed_tags(channel)),
            "opened_at": opened.isoformat(timespec="seconds"),
            "expires_at": expires.isoformat(timespec="seconds"),
            "reason": "" if is_open else "window_expired"}


def evaluate_send(tenant_id: str, *, channel: str, asset_id: str, sender_id: str,
                  message_type: str = "text", tag: str = "",
                  now: Optional[datetime] = None) -> dict:
    """Decide whether a send is allowed right now, and why. Callers use this to
    branch (never to fabricate a 'sent' when blocked)."""
    st = window_state(tenant_id, channel=channel, asset_id=asset_id, sender_id=sender_id, now=now)
    decision = dict(st)
    if st["free_form_allowed"]:
        decision["allowed"] = True
        decision["blocked_reason"] = ""
        return decision
    # outside the window
    if tag and tag in _allowed_tags(channel):
        decision["allowed"] = True
        decision["blocked_reason"] = ""
        decision["used_tag"] = tag
        return decision
    if tag and tag not in _allowed_tags(channel):
        decision["allowed"] = False
        decision["blocked_reason"] = "invalid_tag"
        return decision
    decision["allowed"] = False
    decision["blocked_reason"] = "window_closed"
    return decision
