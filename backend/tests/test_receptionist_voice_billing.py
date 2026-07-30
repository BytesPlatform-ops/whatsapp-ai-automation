"""Voice billing + plan limits (Wave 16). Hermetic."""

from __future__ import annotations

import pytest

from receptionist.providers import voice_adapter as VOICE


class _Tx(VOICE.VoiceTransport):
    def get_account(self, key): return {"id": "org_1"}
    def list_phone_numbers(self, key): return {"data": []}
    def get_phone_number(self, key, n): return {}
    def import_phone_number(self, key, p): return {"id": "x", "number": p.get("number", "")}
    def configure_phone_number(self, key, n, p): return {"id": n}
    def create_assistant(self, key, p): return {"id": "a"}
    def update_assistant(self, key, a, p): return {"id": a}
    def get_assistant(self, key, a): return {"id": a}
    def start_call(self, key, p): return {"id": "call_1", "status": "queued", "type": "outboundPhoneCall", "customer": {"number": (p.get("customer") or {}).get("number", "")}}
    def get_call(self, key, c): return {"id": c, "status": "ended"}
    def end_call(self, key, c): return {"ok": True}
    def transfer_call(self, key, c, d): return {"ok": True}
    def say(self, key, c, t): return {"ok": True}
    def get_call_artifacts(self, key, c): return {}
    def get_recording_metadata(self, key, c): return {}


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores
    from integrations import connections
    stores.reset_all(); connections.clear_connections()
    connections.register_many("t_a", ["voice_read", "voice_send"], {
        "status": "active", "vapi_api_key": "sk", "server_secret": "s", "inbound_enabled": True,
        "outbound_enabled": True, "default_number_id": "pn_v1",
        "numbers": [{"phone_number_id": "pn_v1", "number": "+15550009999"}]})
    VOICE.set_transport(_Tx())
    yield
    VOICE.set_transport(None); stores.reset_all()


def test_product_has_voice_op():
    from credits.products import get_product
    assert "receptionist_voice_op" in get_product("ai_receptionist").operation_types


def test_plan_limits_scale():
    from credits.plans import get_plan, UNLIMITED
    free, starter, pro = get_plan("free"), get_plan("starter"), get_plan("pro")
    assert free.limit("receptionist_voice_numbers") == 0
    assert starter.limit("receptionist_voice_numbers") == 1
    assert starter.limit("receptionist_voice_monthly_recorded_minutes") == 0  # recording off on Starter
    assert pro.limit("receptionist_voice_monthly_inbound_minutes") == UNLIMITED
    assert starter.limit("receptionist_voice_max_call_seconds") == 600


def test_limits_summary_includes_voice():
    from receptionist.service import limits
    s = limits.summary("t_a")
    assert "voice_inbound_minutes" in s and "voice_callback" in s
    assert s["voice_inbound_minutes"]["limit_key"] == "receptionist_voice_monthly_inbound_minutes"


def test_outbound_meters_once(env):
    from receptionist.service import usage
    from receptionist.service.registry import _h_voice_outbound_call
    _h_voice_outbound_call("t_a", {"to": "+15559990000", "number_id": "pn_v1", "responding_to_request": True})
    assert usage.get("t_a", "voice_outbound_initiations") == 1


def test_end_report_settles_minutes_once(env):
    from receptionist.service import voice_sessions, usage
    voice_sessions.create_session("t_a", call_id="call_b", direction="inbound", status="in_progress")
    voice_sessions.process_end_report("t_a", "call_b", report={"duration_seconds": 90, "ended_reason": "customer-ended-call"})
    voice_sessions.process_end_report("t_a", "call_b", report={"duration_seconds": 90, "ended_reason": "customer-ended-call"})
    assert usage.get("t_a", "voice_minutes") == 2  # 90s → 2 min, once
