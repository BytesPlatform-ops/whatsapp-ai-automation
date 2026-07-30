"""Meta Messaging billing + plan limits (Wave 13). Hermetic."""

from __future__ import annotations

import pytest

from receptionist.providers import instagram_messaging as IG
from receptionist.providers import messenger as FB


class _IGTx(IG.InstagramTransport):
    def list_accounts(self, token): return {"data": []}
    def get_account(self, token, a): return {}
    def send_message(self, token, a, p): return {"message_id": "ig.1", "recipient_id": "5551"}
    def mark_seen(self, token, a, r): return {}
    def get_media(self, token, m): return {}
    def download_media(self, token, u): return b""


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores
    from integrations import connections
    stores.reset_all(); connections.clear_connections()
    connections.register_many("t_a", ["instagram_read", "instagram_send"], {
        "status": "active", "instagram_account_id": "ig_1", "access_token": "tok",
        "messaging_enabled": True, "messaging_permission": True, "webhook_subscribed": True})
    IG.set_transport(_IGTx())
    yield
    IG.set_transport(None); stores.reset_all()


def test_product_has_meta_op_types():
    from credits.products import get_product
    ops = get_product("ai_receptionist").operation_types
    assert "receptionist_instagram_op" in ops and "receptionist_messenger_op" in ops


def test_plan_limits_scale():
    from credits.plans import get_plan, UNLIMITED
    free, starter, pro = get_plan("free"), get_plan("starter"), get_plan("pro")
    assert free.limit("receptionist_instagram_accounts") == 0
    assert starter.limit("receptionist_instagram_accounts") == 1
    assert starter.limit("receptionist_messenger_pages") == 1
    assert pro.limit("receptionist_instagram_monthly_replies") == UNLIMITED


def test_limits_summary_includes_meta():
    from receptionist.service import limits
    s = limits.summary("t_a")
    assert "instagram_inbound" in s and "messenger_reply" in s
    assert s["messenger_reply"]["limit_key"] == "receptionist_messenger_monthly_replies"


def test_send_increments_counter_once(env):
    from receptionist.service import meta_messaging_policy, usage
    from receptionist.service.registry import _h_instagram_send
    meta_messaging_policy.record_inbound("t_a", channel="instagram", asset_id="ig_1", sender_id="5551")
    _h_instagram_send("t_a", {"to": "5551", "body": "hi", "asset_id": "ig_1"})
    assert usage.get("t_a", "instagram_reply") == 1
