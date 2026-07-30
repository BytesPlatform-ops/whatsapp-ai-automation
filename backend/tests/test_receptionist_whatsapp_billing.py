"""WhatsApp plan limits + usage counters (Wave 12, Parts 22/23). Hermetic."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores
    stores.reset_all()
    yield
    stores.reset_all()


def test_product_operation_type_enabled():
    from credits.products import get_product
    spec = get_product("ai_receptionist")
    assert "receptionist_whatsapp_op" in spec.operation_types


def test_plan_limits_free_disabled_scale_up():
    from credits.plans import get_plan, UNLIMITED
    free, starter, pro = get_plan("free"), get_plan("starter"), get_plan("pro")
    assert free.limit("receptionist_whatsapp_numbers") == 0        # WhatsApp off on Free
    assert starter.limit("receptionist_whatsapp_numbers") == 1
    assert starter.limit("receptionist_whatsapp_monthly_freeform") == 1000
    for k in ("receptionist_whatsapp_monthly_inbound", "receptionist_whatsapp_monthly_freeform"):
        s, p = starter.limit(k), pro.limit(k)
        assert p == UNLIMITED or p >= s


def test_limits_summary_includes_whatsapp():
    from receptionist.service import limits
    s = limits.summary("t_a")
    assert "whatsapp_freeform" in s and "whatsapp_inbound" in s
    assert s["whatsapp_freeform"]["limit_key"] == "receptionist_whatsapp_monthly_freeform"


def test_send_increments_counter_once():
    from receptionist.providers import whatsapp_cloud as WA
    from receptionist.service import registry, usage, whatsapp_window
    from integrations import connections
    connections.clear_connections()
    connections.register_many("t_a", ["whatsapp_read", "whatsapp_send"], {
        "provider": "meta", "status": "active", "phone_number_id": "pn_1",
        "access_token": "t", "messaging_enabled": True, "webhook_subscribed": True})
    WA.set_transport(WA._MockWhatsAppTransport())
    try:
        whatsapp_window.record_inbound("t_a", phone_number_id="pn_1", wa_id="15559990000")
        res = registry._h_whatsapp_send("t_a", {"to": "15559990000", "body": "hi", "phone_number_id": "pn_1"})
        assert res["status"] == "provider_pending"
        assert usage.get("t_a", "whatsapp_freeform") == 1
    finally:
        WA.set_transport(None)
