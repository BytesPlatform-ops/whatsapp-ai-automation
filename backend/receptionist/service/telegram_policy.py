"""Telegram messaging policy (Part 12). Server-authoritative, versioned.

ONE service decides whether a Telegram outbound action is allowed: standard-Bot vs
Business mode, standard-user initiation (a normal bot never makes unsolicited first
contact), Business connection rights + paused state, consent/suppression, reply
mode, and which interaction types the current mode supports. The model and frontend
can never override it.
"""

from __future__ import annotations

import os
from typing import Optional

REPLY_MODES = ("disabled", "draft_only", "approval_required", "direct_reply")
MODES = ("bot", "business")


def policy_version() -> str:
    return os.environ.get("AI_RECEPTIONIST_TELEGRAM_POLICY_VERSION", "tg-policy-1") or "tg-policy-1"


def _direct_reply_enabled() -> bool:
    return os.environ.get("AI_RECEPTIONIST_TELEGRAM_DIRECT_REPLY_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def reply_mode(tenant_id: str, mode: str = "bot") -> str:
    from . import config_repo
    cfg = config_repo.get_active(tenant_id) or {}
    field = "telegram_business_reply_mode" if mode == "business" else "telegram_reply_mode"
    val = str(cfg.get(field) or os.environ.get("AI_RECEPTIONIST_TELEGRAM_DEFAULT_REPLY_MODE", "") or "draft_only").strip()
    if val == "direct_reply" and not _direct_reply_enabled():
        return "approval_required"
    return val if val in REPLY_MODES else "draft_only"


def supports_inline_keyboard(mode: str) -> bool:
    """Standard bot supports inline keyboards; Business inline support is limited —
    fall back to validated text there."""
    return mode == "bot"


def has_initiated(tenant_id: str, mode: str, chat_id: str) -> bool:
    """A standard bot may only send after the user initiated (any prior inbound in
    this chat sets a durable thread record). Business replies are to an existing
    Business chat, so initiation is implied by the Business message."""
    if mode == "business":
        return True
    from . import telegram_sync
    return telegram_sync.conversation_for(tenant_id, mode, chat_id) is not None \
        or telegram_sync.has_seen_inbound(tenant_id, chat_id)


def evaluate_send(tenant_id: str, *, mode: str, chat_id: str, user_id: str = "",
                  business_connection_id: str = "") -> dict:
    """Decide whether a Telegram send is allowed right now, and why."""
    from . import telegram_sync
    base = {"mode": mode if mode in MODES else "bot", "policy_version": policy_version()}

    if telegram_sync.is_suppressed(tenant_id, user_id or chat_id):
        return {**base, "allowed": False, "blocked_reason": "suppression"}

    if base["mode"] == "business":
        from ..providers import telegram_adapter as tg
        health = tg.validate_connection(tenant_id).get("business", {})
        if health.get("state") == "business_connection_paused":
            return {**base, "allowed": False, "blocked_reason": "business_paused"}
        if not health.get("can_reply", True) or health.get("state") in (
                "business_connection_permission_missing", "business_mode_unavailable",
                "business_connection_missing"):
            return {**base, "allowed": False, "blocked_reason": "business_rights_missing"}
        return {**base, "allowed": True, "blocked_reason": ""}

    # standard bot
    if not has_initiated(tenant_id, "bot", chat_id):
        return {**base, "allowed": False, "blocked_reason": "user_not_initiated"}
    return {**base, "allowed": True, "blocked_reason": ""}
