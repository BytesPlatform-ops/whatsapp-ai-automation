"""Telegram bot connect/validate/webhook + settings + status (Parts 2/3/25).

Connecting a bot validates the token via the provider, persists the verified bot
identity + an opaque webhook_id onto the encrypted connection descriptor (never a
second connection store), and configures the webhook with a secret token. Disconnect
disables operations without deleting history.
"""

from __future__ import annotations

import os
from typing import Optional

from .ids import new_id, now_iso


def _base(tenant_id: str) -> dict:
    from integrations import connections
    return dict(connections.find_active_connection_unsealed(tenant_id, "telegram_read")
                or connections.find_active_connection_unsealed(tenant_id, "telegram_send")
                or {"status": "active"})


def _save(tenant_id: str, descriptor: dict) -> None:
    from integrations import connections
    connections.register_many(tenant_id, ["telegram_read", "telegram_send"], descriptor)


def connect_bot(tenant_id: str, bot_token: str) -> dict:
    """Validate the token via getMe and persist the verified identity + webhook id."""
    from ..providers import telegram_adapter as tg
    base = _base(tenant_id)
    base["bot_token"] = bot_token
    base.setdefault("status", "active")
    base.setdefault("messaging_enabled", True)
    base.setdefault("standard_enabled", True)
    _save(tenant_id, base)
    try:
        me = tg.validate_bot(tenant_id)
    except tg.TelegramError as exc:
        return {"status": "failed", "reason": exc.category}
    base = _base(tenant_id)
    base.update({"bot_id": me["bot_id"], "bot_username": me["bot_username"],
                 "webhook_id": base.get("webhook_id") or new_id("tgwh"),
                 "connected_at": now_iso()})
    _save(tenant_id, base)
    return {"status": "connected", "bot": {"bot_id": me["bot_id"], "bot_username": me["bot_username"]}}


def configure_webhook(tenant_id: str, *, base_url: str = "", allowed_updates: Optional[list] = None) -> dict:
    from ..providers import telegram_adapter as tg
    base = _base(tenant_id)
    if not base.get("bot_token"):
        return {"status": "failed", "reason": "not_connected"}
    secret = base.get("webhook_secret") or os.environ.get("AI_RECEPTIONIST_TELEGRAM_WEBHOOK_SECRET", "") or new_id("tgsec")
    webhook_id = base.get("webhook_id") or new_id("tgwh")
    root = base_url or os.environ.get("PUBLIC_BASE_URL", "") or "https://example.invalid"
    url = f"{root}/api/agents/ai-receptionist/telegram/webhook/{webhook_id}"
    updates = allowed_updates or ["message", "edited_message", "callback_query",
                                  "business_connection", "business_message",
                                  "edited_business_message", "deleted_business_messages"]
    try:
        tg.configure_webhook(tenant_id, url=url, secret=secret, allowed_updates=updates)
    except tg.TelegramError as exc:
        return {"status": "failed", "reason": exc.category}
    base.update({"webhook_secret": secret, "webhook_id": webhook_id, "allowed_updates": updates,
                 "webhook_subscribed": True, "webhook_unhealthy": False})
    _save(tenant_id, base)
    return {"status": "configured", "allowed_updates": updates}


def rotate_webhook_secret(tenant_id: str, *, base_url: str = "") -> dict:
    base = _base(tenant_id)
    base["webhook_secret"] = new_id("tgsec")
    _save(tenant_id, base)
    return configure_webhook(tenant_id, base_url=base_url)


def remove_webhook(tenant_id: str) -> dict:
    from ..providers import telegram_adapter as tg
    try:
        tg.remove_webhook(tenant_id)
    except tg.TelegramError as exc:
        return {"status": "failed", "reason": exc.category}
    base = _base(tenant_id)
    base["webhook_subscribed"] = False
    _save(tenant_id, base)
    return {"status": "removed"}


def set_mode_enabled(tenant_id: str, *, standard: Optional[bool] = None, business: Optional[bool] = None) -> dict:
    base = _base(tenant_id)
    if standard is not None:
        base["standard_enabled"] = bool(standard)
    if business is not None:
        base["business_enabled"] = bool(business)
    _save(tenant_id, base)
    from ..providers import telegram_adapter as tg
    return {"status": "updated", "connection": tg.validate_connection(tenant_id)}


def disconnect(tenant_id: str) -> dict:
    from integrations import connections
    connections.disconnect(tenant_id, ["telegram_read", "telegram_send"])
    return {"status": "disconnected"}


def status(tenant_id: str) -> dict:
    from ..providers import telegram_adapter as tg
    from . import telegram_policy
    return {
        "connection": tg.validate_connection(tenant_id),
        "reply_mode": telegram_policy.reply_mode(tenant_id, "bot"),
        "business_reply_mode": telegram_policy.reply_mode(tenant_id, "business"),
    }
