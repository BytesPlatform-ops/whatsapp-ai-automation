"""WhatsApp customer-service-window policy (Wave 12, Part 10).

One server-authoritative policy service — no scattered timing logic. A verified
inbound customer message opens a free-form messaging window (24h under current
provider rules); outside it, free-form sends are blocked and an approved template
is required. State is durable and versioned so a provider-policy change is a config
bump, not an engine rewrite. The frontend and model can never override this.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from . import stores
from .ids import now_iso

WINDOW_HOURS = 24


def policy_version() -> str:
    return os.environ.get("AI_RECEPTIONIST_WHATSAPP_WINDOW_POLICY_VERSION", "wa-window-1") or "wa-window-1"


def _key(tenant_id: str, phone_number_id: str, wa_id: str) -> str:
    from ..providers.whatsapp_cloud import normalise_wa_id
    return f"waw::{tenant_id}::{phone_number_id}::{normalise_wa_id(wa_id)}"


def record_inbound(tenant_id: str, *, phone_number_id: str, wa_id: str, ts: Optional[str] = None) -> dict:
    """A verified inbound customer message (re)opens the window from ``ts``."""
    ts = ts or now_iso()
    rid = _key(tenant_id, phone_number_id, wa_id)
    rec = {
        "id": rid, "tenant_id": tenant_id, "phone_number_id": phone_number_id,
        "wa_id": wa_id, "opened_at": ts, "last_inbound_at": ts,
        "policy_version": policy_version(), "updated_at": now_iso(),
    }
    return stores.wa_windows().put(tenant_id, rec)


def _parse(iso: str) -> Optional[datetime]:
    try:
        dt = datetime.fromisoformat((iso or "").replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None


def window_state(tenant_id: str, *, phone_number_id: str, wa_id: str,
                 now: Optional[datetime] = None) -> dict:
    """Return the current window state. Free-form is permitted only inside an open
    window; otherwise a template is required."""
    now = now or datetime.now(timezone.utc)
    rec = stores.wa_windows().get(tenant_id, _key(tenant_id, phone_number_id, wa_id))
    if rec is None:
        return {"open": False, "free_form_allowed": False, "template_required": True,
                "opened_at": "", "expires_at": "", "reason": "no_inbound_window",
                "policy_version": policy_version()}
    opened = _parse(rec.get("last_inbound_at") or rec.get("opened_at", ""))
    if opened is None:
        return {"open": False, "free_form_allowed": False, "template_required": True,
                "opened_at": "", "expires_at": "", "reason": "unparseable_window",
                "policy_version": policy_version()}
    expires = opened + timedelta(hours=WINDOW_HOURS)
    is_open = now < expires
    return {
        "open": is_open,
        "free_form_allowed": is_open,
        "template_required": not is_open,
        "opened_at": opened.isoformat(timespec="seconds"),
        "expires_at": expires.isoformat(timespec="seconds"),
        "reason": "" if is_open else "window_expired",
        "policy_version": policy_version(),
    }


def assert_send_allowed(tenant_id: str, *, phone_number_id: str, wa_id: str,
                        message_type: str = "text", now: Optional[datetime] = None) -> dict:
    """Return the window state; templates are always allowed, free-form/interactive
    only inside the window. Callers use this to decide template vs free-form (never
    to fabricate a 'sent' when blocked)."""
    st = window_state(tenant_id, phone_number_id=phone_number_id, wa_id=wa_id, now=now)
    if message_type == "template":
        st["allowed"] = True
    else:
        st["allowed"] = st["free_form_allowed"]
    return st
