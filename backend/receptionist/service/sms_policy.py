"""SMS compliance + quiet-hours policy (Parts 8/9/11). Server-authoritative.

ONE versioned policy service — no timing/consent rules scattered in handlers or the
UI. It decides whether an SMS may be sent right now: consent, suppression,
message purpose (transactional/support/promotional), and quiet-hours in the
workspace (or contact) timezone. The model and frontend can never override it.
Quiet-hours blocked messages are queued (``delayed_until``) rather than silently
sent or dropped.
"""

from __future__ import annotations

import os
from datetime import datetime, time, timedelta
from typing import Optional

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

REPLY_MODES = ("disabled", "draft_only", "approval_required", "direct_reply")
PURPOSES = ("transactional", "support", "promotional")
_DEFAULT_TZ = "UTC"
_DEFAULT_QUIET_START = 21  # 9pm
_DEFAULT_QUIET_END = 8     # 8am


def policy_version() -> str:
    return os.environ.get("AI_RECEPTIONIST_SMS_POLICY_VERSION", "sms-policy-1") or "sms-policy-1"


def reply_mode(tenant_id: str) -> str:
    from . import config_repo
    cfg = config_repo.get_active(tenant_id) or {}
    mode = str(cfg.get("sms_reply_mode")
               or os.environ.get("AI_RECEPTIONIST_SMS_DEFAULT_REPLY_MODE", "")
               or "draft_only").strip()
    if mode == "direct_reply" and os.environ.get("AI_RECEPTIONIST_SMS_DIRECT_REPLY_ENABLED", "").lower() not in ("1", "true", "yes", "on"):
        return "approval_required"
    return mode if mode in REPLY_MODES else "draft_only"


def quiet_hours_config(tenant_id: str) -> dict:
    from . import config_repo
    cfg = config_repo.get_active(tenant_id) or {}
    q = cfg.get("sms_quiet_hours") or {}
    return {
        "enabled": bool(q.get("enabled", True)),
        "start_hour": int(q.get("start_hour", _DEFAULT_QUIET_START)),
        "end_hour": int(q.get("end_hour", _DEFAULT_QUIET_END)),
        "timezone": q.get("timezone") or cfg.get("timezone") or _DEFAULT_TZ,
        # allowed weekdays (Mon=0); an explicit empty list means "no allowed days",
        # so it is honoured rather than falling back to the all-days default.
        "days": q["days"] if isinstance(q.get("days"), list) else [0, 1, 2, 3, 4, 5, 6],
    }


def promotional_enabled(tenant_id: str) -> bool:
    from . import config_repo
    cfg = config_repo.get_active(tenant_id) or {}
    return bool(cfg.get("sms_promotional_enabled", False))


def _zone(tz: str):
    if ZoneInfo is None:
        return None
    try:
        return ZoneInfo(tz)
    except Exception:
        return ZoneInfo("UTC") if tz != "UTC" else None


def _in_quiet(now_local: datetime, start_h: int, end_h: int) -> bool:
    """Quiet window [start_h, end_h). Handles windows that wrap midnight."""
    h = now_local.hour
    if start_h == end_h:
        return False
    if start_h < end_h:
        return start_h <= h < end_h
    return h >= start_h or h < end_h  # wraps midnight


def _next_allowed(now_local: datetime, cfg: dict):
    """Next local datetime at which sending is permitted."""
    end_h = cfg["end_hour"]
    days = set(cfg["days"])
    candidate = now_local
    for _ in range(0, 14):  # search up to two weeks (defensive)
        if not _in_quiet(candidate, cfg["start_hour"], end_h) and candidate.weekday() in days:
            return candidate
        # jump to the window end today, else next day start-of-allowed
        nxt = candidate.replace(hour=end_h, minute=0, second=0, microsecond=0)
        if nxt <= candidate:
            nxt = (candidate + timedelta(days=1)).replace(hour=end_h, minute=0, second=0, microsecond=0)
        candidate = nxt
    return now_local


def evaluate_send(tenant_id: str, *, to_number: str, purpose: str = "support",
                  responding_to_inbound: bool = False, now: Optional[datetime] = None) -> dict:
    """Decide whether an SMS to ``to_number`` may be sent now, and why."""
    from . import sms_sync
    base = {"policy_version": policy_version(), "purpose": purpose if purpose in PURPOSES else "support"}

    if sms_sync.is_suppressed(tenant_id, to_number):
        return {**base, "allowed": False, "blocked_reason": "suppression",
                "quiet_hours_active": False, "delayed_until": ""}

    if base["purpose"] == "promotional" and not promotional_enabled(tenant_id):
        return {**base, "allowed": False, "blocked_reason": "promotional_disabled",
                "quiet_hours_active": False, "delayed_until": ""}

    cfg = quiet_hours_config(tenant_id)
    # A direct reply to a customer who just texted is not gated by quiet hours.
    if not cfg["enabled"] or responding_to_inbound:
        return {**base, "allowed": True, "blocked_reason": "", "quiet_hours_active": False, "delayed_until": ""}

    zone = _zone(cfg["timezone"])
    now = now or (datetime.now(zone) if zone else datetime.utcnow())
    now_local = now.astimezone(zone) if (zone and now.tzinfo) else now
    quiet = _in_quiet(now_local, cfg["start_hour"], cfg["end_hour"]) or now_local.weekday() not in set(cfg["days"])
    if quiet:
        nxt = _next_allowed(now_local, cfg)
        return {**base, "allowed": False, "blocked_reason": "quiet_hours",
                "quiet_hours_active": True, "delayed_until": nxt.isoformat(timespec="seconds"),
                "timezone": cfg["timezone"]}
    return {**base, "allowed": True, "blocked_reason": "", "quiet_hours_active": False, "delayed_until": ""}
