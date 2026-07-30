"""Voice/telephony channel — adapter, server events, sessions, transcripts, tools,
transfer, end-of-call, compliance (Wave 16). Hermetic: mock Vapi transport injected;
NO live Vapi/telephony/model/voice calls.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from receptionist.providers import voice_adapter as VOICE

BASE = "/api/agents/ai-receptionist"
SECRET = "vapi-server-secret"


class _Tx(VOICE.VoiceTransport):
    def __init__(self):
        self.calls = 0
    def get_account(self, key): return {"id": "org_1", "name": "Acme"}
    def list_phone_numbers(self, key):
        return {"data": [{"id": "pn_v1", "number": "+15550009999", "provider": "vapi",
                          "country": "US", "inbound": True, "outbound": True}]}
    def get_phone_number(self, key, nid): return {"id": nid, "number": "+15550009999", "inbound": True, "outbound": True}
    def import_phone_number(self, key, payload): return {"id": "pn_imp", "number": payload.get("number", ""), "provider": payload.get("provider", "twilio")}
    def configure_phone_number(self, key, nid, payload): return {"id": nid, "number": "+15550009999"}
    def create_assistant(self, key, payload): return {"id": "asst_1", "name": "Pixie"}
    def update_assistant(self, key, aid, payload): return {"id": aid}
    def get_assistant(self, key, aid): return {"id": aid}
    def start_call(self, key, payload):
        self.calls += 1
        return {"id": f"call_{self.calls}", "status": "queued", "type": "outboundPhoneCall",
                "phoneNumberId": payload.get("phoneNumberId", ""), "customer": {"number": (payload.get("customer") or {}).get("number", "")}}
    def get_call(self, key, cid): return {"id": cid, "status": "ended", "endedReason": "customer-ended-call", "durationSeconds": 65}
    def end_call(self, key, cid): return {"ok": True}
    def transfer_call(self, key, cid, dest): return {"ok": True, "status": "transferring"}
    def say(self, key, cid, text): return {"ok": True}
    def get_call_artifacts(self, key, cid): return {}
    def get_recording_metadata(self, key, cid): return {"recordingUrl": "https://x", "durationSeconds": 65}


def _register(tenant="t_a", *, outbound=False, transfer=False):
    from integrations import connections
    desc = {"provider": "vapi", "status": "active", "vapi_api_key": "sk_secret", "vapi_account_id": "org_1",
            "server_secret": SECRET, "inbound_enabled": True, "outbound_enabled": outbound,
            "recording_enabled": False, "default_number_id": "pn_v1",
            "numbers": [{"phone_number_id": "pn_v1", "number": "+15550009999"}]}
    connections.register_many(tenant, ["voice_read", "voice_send"], desc)


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    from integrations import connections, webhook_events
    stores.reset_all(); jobs_store.reset_stores(); connections.clear_connections()
    try: webhook_events._reset_repos()
    except Exception: pass
    VOICE.set_transport(_Tx())
    _register()
    yield
    VOICE.set_transport(None); stores.reset_all()


@pytest.fixture()
def client(env, monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    import app
    return TestClient(app.app)


def _event(client, message, secret=SECRET):
    return client.post(f"{BASE}/voice/webhook", content=json.dumps({"message": message}).encode(),
                       headers={"x-vapi-secret": secret, "content-type": "application/json"})


# ── adapter ───────────────────────────────────────────────────────────────────

def test_validate_connection_inbound_ready(env):
    v = VOICE.validate_connection("t_a")
    assert v["connected"] and v["state"] == "ready_for_inbound" and not v["outbound_enabled"]


def test_outbound_ready_when_enabled(env):
    _register(outbound=True)
    v = VOICE.validate_connection("t_a")
    assert v["state"] == "ready_inbound_outbound" and v["outbound_enabled"]


def test_normalise_call_ended_reason(env):
    nc = VOICE.normalise_call({"id": "c1", "status": "ended", "endedReason": "customer-did-not-answer"})
    assert nc["status"] == "no_answer" and nc["ended_reason"] == "customer-did-not-answer"


# ── server events ─────────────────────────────────────────────────────────────

def test_assistant_request_returns_bounded_config(client, env):
    from receptionist.service import config_repo
    config_repo.save("t_a", {"business_name": "Acme Ltd", "hours": "9-5"}, updated_by="t")
    msg = {"type": "assistant-request", "call": {"id": "call_in1", "phoneNumberId": "pn_v1",
           "customer": {"number": "+15551234567"}}}
    r = _event(client, msg)
    assert r.status_code == 200
    cfg = r.json()["assistant"]
    assert cfg["facts"]["business_name"] == "Acme Ltd" and "vapi_api_key" not in json.dumps(cfg)
    assert cfg["recording"]["enabled"] is False  # recording off by default


def test_server_event_forged_secret_rejected(client, env):
    r = _event(client, {"type": "status-update", "call": {"id": "c", "phoneNumberId": "pn_v1"}, "status": "ringing"}, secret="wrong")
    assert r.status_code == 403


def test_server_event_unknown_number_ignored(client, env):
    r = _event(client, {"type": "status-update", "call": {"id": "c", "phoneNumberId": "pn_UNKNOWN"}, "status": "ringing"})
    assert r.json().get("skipped") == "unknown_number"


def test_server_event_oversized_rejected(client, env):
    big = json.dumps({"message": {"x": "y" * 600_000}}).encode()
    r = client.post(f"{BASE}/voice/webhook", content=big, headers={"x-vapi-secret": SECRET})
    assert r.status_code == 413


def test_status_event_deduped(client, env):
    from receptionist.service import voice_sessions
    voice_sessions.create_session("t_a", call_id="call_s1", direction="inbound", caller_number="+15551112222")
    msg = {"type": "status-update", "call": {"id": "call_s1", "phoneNumberId": "pn_v1"}, "status": "ringing"}
    _event(client, msg)
    r2 = _event(client, msg)
    assert r2.json().get("deduped") is True


# ── sessions + transcripts ────────────────────────────────────────────────────

def test_session_creates_conversation(env):
    from receptionist.service import voice_sessions
    s = voice_sessions.create_session("t_a", call_id="call_x", direction="inbound", caller_number="+15551112222")
    assert s["conversation_id"] and s["contact_id"] and s["status"] == "requested"


def test_transcript_partial_then_final(env):
    from receptionist.service import voice_sessions, stores
    voice_sessions.create_session("t_a", call_id="call_t", direction="inbound", caller_number="+15551112222")
    voice_sessions.record_transcript("t_a", "call_t", sequence=0, speaker="customer", text="hel", final=False)
    voice_sessions.record_transcript("t_a", "call_t", sequence=0, speaker="customer", text="hello there", final=True)
    dup = voice_sessions.record_transcript("t_a", "call_t", sequence=0, speaker="customer", text="hello there", final=True)
    assert dup["status"] == "duplicate"
    msgs = [m for m in stores.messages().list("t_a")]
    assert any(m.get("text") == "hello there" for m in msgs)


def test_status_monotonic(env):
    from receptionist.service import voice_sessions
    voice_sessions.create_session("t_a", call_id="call_m", direction="inbound", status="ringing")
    voice_sessions.update_status("t_a", "call_m", status="in_progress")
    voice_sessions.update_status("t_a", "call_m", status="ringing")  # older event ignored
    assert voice_sessions.session_for_call("t_a", "call_m")["status"] == "in_progress"


# ── tool calls ────────────────────────────────────────────────────────────────

def test_tool_call_idempotent(env):
    from receptionist.service import config_repo, voice_sessions
    config_repo.save("t_a", {"business_name": "Acme", "hours": "9am to 5pm"}, updated_by="t")
    voice_sessions.create_session("t_a", call_id="call_tc", direction="inbound", caller_number="+15551112222")
    r1 = voice_sessions.process_tool_call("t_a", "call_tc", tool_call_id="tc1",
                                          tool_name="get_business_hours", arguments={})
    assert r1["status"] == "executed" and "9am to 5pm" in r1["result"]["speech"]
    r2 = voice_sessions.process_tool_call("t_a", "call_tc", tool_call_id="tc1",
                                          tool_name="get_business_hours", arguments={})
    assert r2["status"] == "duplicate"


def test_tool_call_via_webhook_returns_speech(client, env):
    from receptionist.service import config_repo, voice_sessions
    config_repo.save("t_a", {"business_name": "Acme", "hours": "9-5"}, updated_by="t")
    voice_sessions.create_session("t_a", call_id="call_w", direction="inbound", caller_number="+15551112222")
    msg = {"type": "tool-calls", "call": {"id": "call_w", "phoneNumberId": "pn_v1"},
           "toolCalls": [{"id": "tcx", "function": {"name": "get_business_hours", "arguments": "{}"}}]}
    r = _event(client, msg)
    assert r.status_code == 200 and r.json()["results"][0]["toolCallId"] == "tcx"


# ── transfer ──────────────────────────────────────────────────────────────────

def test_transfer_no_destination(env):
    from receptionist.service import voice_sessions
    voice_sessions.create_session("t_a", call_id="call_xf", direction="inbound")
    res = voice_sessions.process_transfer("t_a", "call_xf", department="sales")
    assert res["status"] == "no_destination"


def test_transfer_with_verified_destination(env):
    from receptionist.service import config_repo, voice_sessions
    config_repo.save("t_a", {"voice_transfer_destinations": [
        {"id": "d1", "department": "sales", "label": "Sales", "number": "+15550000000", "verified": True}]}, updated_by="t")
    voice_sessions.create_session("t_a", call_id="call_xf2", direction="inbound")
    res = voice_sessions.process_transfer("t_a", "call_xf2", department="sales", outcome="transferred")
    assert res["status"] == "transferred" and res["destination_label"] == "Sales"
    assert voice_sessions.session_for_call("t_a", "call_xf2")["ai_paused"] is True


# ── end-of-call ───────────────────────────────────────────────────────────────

def test_end_report_idempotent_and_settles_once(env):
    from receptionist.service import voice_sessions, usage
    voice_sessions.create_session("t_a", call_id="call_e", direction="inbound", status="in_progress")
    r1 = voice_sessions.process_end_report("t_a", "call_e", report={"duration_seconds": 120, "ended_reason": "customer-ended-call"})
    assert r1["status"] == "processed"
    r2 = voice_sessions.process_end_report("t_a", "call_e", report={"duration_seconds": 120, "ended_reason": "customer-ended-call"})
    assert r2["status"] == "duplicate"
    assert usage.get("t_a", "voice_minutes") == 2  # 120s → 2 min, counted once


# ── outbound compliance ───────────────────────────────────────────────────────

def test_outbound_disabled_by_default(env):
    from receptionist.service.registry import _h_voice_outbound_call
    res = _h_voice_outbound_call("t_a", {"to": "+15559990000", "number_id": "pn_v1"})
    assert res["status"] == "blocked_by_policy" and "outbound_disabled" in res["detail"]


def test_outbound_suppressed_blocked(env):
    _register(outbound=True)
    from receptionist.service import stores
    from receptionist.service.schemas import OptOut
    from receptionist.service.registry import _h_voice_outbound_call
    stores.optouts().put("t_a", OptOut(tenant_id="t_a", phone="+15559990000", channel="voice", scope="channel").model_dump())
    res = _h_voice_outbound_call("t_a", {"to": "+15559990000", "number_id": "pn_v1"})
    assert res["status"] == "suppressed"


def test_outbound_call_once(env):
    _register(outbound=True)
    from receptionist.service import voice_sessions
    from receptionist.service.registry import _h_voice_outbound_call
    res = _h_voice_outbound_call("t_a", {"to": "+15559990000", "number_id": "pn_v1", "responding_to_request": True})
    assert res["status"] == "queued" and res["record_id"]
    assert voice_sessions.session_for_call("t_a", res["record_id"]) is not None


def test_recording_off_by_default(env):
    from receptionist.service import voice_policy
    assert voice_policy.recording_policy("t_a")["enabled"] is False
