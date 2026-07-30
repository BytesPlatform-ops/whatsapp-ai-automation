"""Telegram billing + plan limits (Wave 15). Hermetic."""

from __future__ import annotations

import pytest

from receptionist.providers import telegram_adapter as TG


class _Tx(TG.TelegramTransport):
    def get_me(self, token): return {"ok": True, "result": {"id": 111, "username": "b"}}
    def set_webhook(self, t, u, s, a): return {"ok": True}
    def get_webhook_info(self, t): return {"ok": True, "result": {}}
    def delete_webhook(self, t): return {"ok": True}
    def send_message(self, token, payload): return {"ok": True, "result": {"message_id": 1, "chat": {"id": payload.get("chat_id")}}}
    def edit_message(self, t, p): return {"ok": True, "result": {"message_id": 1}}
    def delete_message(self, t, c, m): return {"ok": True}
    def answer_callback_query(self, t, c, x): return {"ok": True}
    def send_chat_action(self, t, c, a): return {"ok": True}
    def send_media(self, t, m, p): return {"ok": True, "result": {"message_id": 2, "chat": {"id": p.get("chat_id")}}}
    def get_file(self, t, f): return {"ok": True, "result": {}}
    def download_file(self, t, p): return b""
    def get_business_connection(self, t, b): return {"ok": True, "result": {"id": b, "rights": {"can_reply": True}}}


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores
    from integrations import connections
    stores.reset_all(); connections.clear_connections()
    connections.register_many("t_a", ["telegram_read", "telegram_send"], {
        "status": "active", "bot_token": "1:A", "bot_id": "111", "bot_username": "b",
        "messaging_enabled": True, "standard_enabled": True, "webhook_subscribed": True})
    TG.set_transport(_Tx())
    yield
    TG.set_transport(None); stores.reset_all()


def test_product_has_telegram_op():
    from credits.products import get_product
    assert "receptionist_telegram_op" in get_product("ai_receptionist").operation_types


def test_plan_limits_scale():
    from credits.plans import get_plan, UNLIMITED
    free, starter, pro = get_plan("free"), get_plan("starter"), get_plan("pro")
    assert free.limit("receptionist_telegram_bots") == 0
    assert starter.limit("receptionist_telegram_bots") == 1
    assert starter.limit("receptionist_telegram_business_connections") == 1
    assert pro.limit("receptionist_telegram_monthly_replies") == UNLIMITED


def test_limits_summary_includes_telegram():
    from receptionist.service import limits
    s = limits.summary("t_a")
    assert "telegram_inbound" in s and "telegram_reply" in s and "telegram_callback" in s
    assert s["telegram_reply"]["limit_key"] == "receptionist_telegram_monthly_replies"


def test_send_meters_once(env):
    from receptionist.service import telegram_sync, usage
    from receptionist.service.registry import _h_telegram_send
    telegram_sync._mark_initiated("t_a", "bot", "900")
    _h_telegram_send("t_a", {"chat_id": "900", "user_id": "900", "body": "hi"})
    assert usage.get("t_a", "telegram_send") == 1
