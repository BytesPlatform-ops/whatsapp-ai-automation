"""SMS billing + plan limits (Wave 14). Hermetic."""

from __future__ import annotations

import pytest

from receptionist.providers import sms_adapter as SMS


class _Tx(SMS.SMSTransport):
    def list_numbers(self, creds): return {"incoming_phone_numbers": []}
    def get_number(self, creds, n): return {}
    def send_message(self, creds, p): return {"sid": "SM1", "status": "queued", "num_segments": 2, "to": p.get("To", "")}
    def get_message_status(self, creds, m): return {"status": "delivered"}
    def download_media(self, creds, u): return b""


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores
    from integrations import connections
    stores.reset_all(); connections.clear_connections()
    connections.register_many("t_a", ["sms_read", "sms_send"], {
        "status": "active", "account_sid": "AC", "auth_token": "tok", "sender_number": "+15550001111",
        "sms_capable": True, "messaging_enabled": True, "inbound_webhook_subscribed": True,
        "delivery_webhook_subscribed": True})
    SMS.set_transport(_Tx())
    yield
    SMS.set_transport(None); stores.reset_all()


def test_product_has_sms_op():
    from credits.products import get_product
    assert "receptionist_sms_op" in get_product("ai_receptionist").operation_types


def test_plan_limits_scale():
    from credits.plans import get_plan, UNLIMITED
    free, starter, pro = get_plan("free"), get_plan("starter"), get_plan("pro")
    assert free.limit("receptionist_sms_numbers") == 0
    assert starter.limit("receptionist_sms_numbers") == 1
    assert starter.limit("receptionist_sms_monthly_segments") == 3000
    assert pro.limit("receptionist_sms_monthly_replies") == UNLIMITED


def test_limits_summary_includes_sms():
    from receptionist.service import limits
    s = limits.summary("t_a")
    assert "sms_inbound" in s and "sms_segments" in s
    assert s["sms_segments"]["limit_key"] == "receptionist_sms_monthly_segments"


def test_send_meters_message_and_segments(env):
    from receptionist.service import usage
    from receptionist.service.registry import _h_sms_send
    _h_sms_send("t_a", {"to": "+15559990000", "body": "hi", "sender_number": "+15550001111",
                        "responding_to_inbound": True})
    assert usage.get("t_a", "sms_reply") == 1
    assert usage.get("t_a", "sms_segments") == 2  # provider returned 2 segments
