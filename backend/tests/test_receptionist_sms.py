"""SMS channel — adapter, segmentation, webhook, inbound, policy/quiet-hours,
send, status, compliance (Wave 14). Hermetic: mock transport injected; NO live
provider calls.
"""

from __future__ import annotations

import base64
import hashlib
import hmac

import pytest
from fastapi.testclient import TestClient

from receptionist.providers import sms_adapter as SMS

BASE = "/api/agents/ai-receptionist"
AUTH_TOKEN = "test-auth-token"


class _Tx(SMS.SMSTransport):
    def __init__(self):
        self.sends = 0
    def list_numbers(self, creds):
        return {"incoming_phone_numbers": [
            {"phone_number": "+15550001111", "friendly_name": "Main", "iso_country": "US",
             "capabilities": {"sms": True, "mms": True}},
            {"phone_number": "+15550002222", "friendly_name": "NoSMS", "iso_country": "US",
             "capabilities": {"sms": False, "mms": False}}]}
    def get_number(self, creds, number): return {"phone_number": number, "capabilities": {"sms": True}}
    def send_message(self, creds, payload):
        self.sends += 1
        return {"sid": f"SM{self.sends}", "status": "queued", "num_segments": 1, "to": payload.get("To", "")}
    def get_message_status(self, creds, mid): return {"status": "delivered", "num_segments": 1}
    def download_media(self, creds, url): return b"x"


def _register(tenant="t_a", number="+15550001111"):
    from integrations import connections
    connections.register_many(tenant, ["sms_read", "sms_send"], {
        "provider": "twilio", "status": "active", "account_sid": "AC123", "auth_token": AUTH_TOKEN,
        "sender_number": number, "country": "US", "sms_capable": True, "mms_capable": True,
        "messaging_enabled": True, "inbound_webhook_subscribed": True, "delivery_webhook_subscribed": True})


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
    tx = _Tx(); SMS.set_transport(tx)
    _register()
    yield tx
    SMS.set_transport(None); stores.reset_all()


@pytest.fixture()
def client(env, monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    import app
    return TestClient(app.app)


def _twilio_sig(url: str, params: dict) -> str:
    data = url + "".join(f"{k}{params[k]}" for k in sorted(params.keys()))
    digest = hmac.new(AUTH_TOKEN.encode(), data.encode(), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


def _post_form(client, path, params, sign=True):
    url = f"http://testserver{path}"
    headers = {}
    if sign:
        headers["x-twilio-signature"] = _twilio_sig(url, params)
    return client.post(path, data=params, headers=headers)


# ── adapter + discovery ───────────────────────────────────────────────────────

def test_validate_connection_ready(env):
    v = SMS.validate_connection("t_a")
    assert v["connected"] and v["state"] == "ready_to_send" and v["can_send"]


def test_readiness_no_number(env):
    from integrations import connections
    connections.register_many("t_b", ["sms_read"], {"status": "active", "account_sid": "AC", "auth_token": "x"})
    v = SMS.validate_connection("t_b")
    assert v["state"] == "no_numbers" and not v.get("can_send")


def test_list_numbers(env):
    nums = SMS.list_numbers("t_a")
    assert nums[0]["sender_number"] == "+15550001111" and nums[0]["mms_capable"]


def test_send_once(env):
    tx = env
    res = SMS.send_sms("t_a", to="+15559990000", body="hi")
    assert res["message_id"] == "SM1" and tx.sends == 1


def test_invalid_recipient(env):
    with pytest.raises(SMS.SMSError) as e:
        SMS.send_sms("t_a", to="not-a-number", body="hi")
    assert e.value.category == "invalid_recipient"


# ── segmentation ──────────────────────────────────────────────────────────────

def test_segments_gsm_and_ucs2(env):
    from receptionist.service import sms_segments
    assert sms_segments.analyze("hello")["segments"] == 1
    assert sms_segments.analyze("a" * 161)["segments"] == 2
    r = sms_segments.analyze("emoji 😀")
    assert r["encoding"] == "UCS-2" and r["segments"] == 1


# ── webhook ───────────────────────────────────────────────────────────────────

def test_webhook_valid_signature_enqueues(client):
    params = {"MessageSid": "SMx1", "From": "+15559990000", "To": "+15550001111", "Body": "hello", "NumMedia": "0"}
    r = _post_form(client, f"{BASE}/sms/webhook", params)
    assert r.status_code == 200 and r.json().get("enqueued") is True


def test_webhook_forged_signature_rejected(client):
    params = {"MessageSid": "SMx2", "From": "+15559990000", "To": "+15550001111", "Body": "hi", "NumMedia": "0"}
    r = client.post(f"{BASE}/sms/webhook", data=params, headers={"x-twilio-signature": "wrong"})
    assert r.status_code == 403


def test_webhook_unknown_number_ignored(client):
    params = {"MessageSid": "SMx3", "From": "+1", "To": "+19999999999", "Body": "hi", "NumMedia": "0"}
    r = _post_form(client, f"{BASE}/sms/webhook", params)
    assert r.json().get("skipped") == "unknown_number"


def test_webhook_duplicate_deduped(client):
    params = {"MessageSid": "SMdup", "From": "+15559990000", "To": "+15550001111", "Body": "hi", "NumMedia": "0"}
    _post_form(client, f"{BASE}/sms/webhook", params)
    r2 = _post_form(client, f"{BASE}/sms/webhook", params)
    assert r2.json().get("deduped") is True


def test_webhook_oversized_rejected(client):
    big = "x" * 600_000
    r = client.post(f"{BASE}/sms/webhook", data={"Body": big}, headers={"x-twilio-signature": "x"})
    assert r.status_code == 413


def test_webhook_cross_workspace_forged_tenant_ignored(client):
    params = {"MessageSid": "SMc1", "From": "+1", "To": "+15550001111", "Body": "hi",
              "NumMedia": "0", "tenant_id": "attacker"}
    r = _post_form(client, f"{BASE}/sms/webhook", params)
    # resolves by verified To number, not the forged tenant_id
    assert r.status_code == 200 and r.json().get("enqueued") is True


# ── inbound processing ────────────────────────────────────────────────────────

def test_inbound_draft_only(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_SMS_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import sms_sync
    out = sms_sync.process_message("t_a", sender_number="+15550001111", payload={
        "MessageSid": "SM1", "From": "+15559990000", "To": "+15550001111", "Body": "hi", "NumMedia": "0"})
    assert out["status"] == "draft_only" and out["segments"] >= 1


def test_inbound_idempotent(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_SMS_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import sms_sync
    p = {"MessageSid": "SMsame", "From": "+15559990000", "To": "+15550001111", "Body": "hi", "NumMedia": "0"}
    sms_sync.process_message("t_a", sender_number="+15550001111", payload=p)
    out2 = sms_sync.process_message("t_a", sender_number="+15550001111", payload=p)
    assert out2["status"] == "duplicate"


def test_inbound_mms_stored(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_SMS_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import sms_sync, stores
    sms_sync.process_message("t_a", sender_number="+15550001111", payload={
        "MessageSid": "SMm", "From": "+15559990000", "To": "+15550001111", "Body": "look",
        "NumMedia": "1", "MediaUrl0": "https://x/1.jpg", "MediaContentType0": "image/jpeg"})
    assert len(stores.sms_media().list("t_a")) == 1


def test_inbound_empty_ignored(env):
    from receptionist.service import sms_sync
    out = sms_sync.process_message("t_a", sender_number="+15550001111", payload={
        "MessageSid": "SMe", "From": "+15559990000", "To": "+15550001111", "Body": "", "NumMedia": "0"})
    assert out["status"] == "empty_ignored"


def test_opt_out_then_opt_in(env):
    from receptionist.service import sms_sync
    out = sms_sync.process_message("t_a", sender_number="+15550001111", payload={
        "MessageSid": "SMo", "From": "+15559990000", "To": "+15550001111", "Body": "STOP", "NumMedia": "0"})
    assert out["status"] == "opted_out"
    assert sms_sync.is_suppressed("t_a", "+15559990000")
    out2 = sms_sync.process_message("t_a", sender_number="+15550001111", payload={
        "MessageSid": "SMi", "From": "+15559990000", "To": "+15550001111", "Body": "START", "NumMedia": "0"})
    assert out2["status"] == "opted_in"
    assert not sms_sync.is_suppressed("t_a", "+15559990000")


# ── quiet hours / policy ──────────────────────────────────────────────────────

def test_quiet_hours_blocks_non_reply(env):
    from receptionist.service import config_repo, sms_policy
    from datetime import datetime, timezone
    config_repo.save("t_a", {"sms_quiet_hours": {"enabled": True, "start_hour": 0, "end_hour": 23,
                                                 "timezone": "UTC", "days": [0, 1, 2, 3, 4, 5, 6]}}, updated_by="t")
    at = datetime(2026, 8, 17, 5, 0, tzinfo=timezone.utc)
    d = sms_policy.evaluate_send("t_a", to_number="+15559990000", responding_to_inbound=False, now=at)
    assert not d["allowed"] and d["blocked_reason"] == "quiet_hours" and d["delayed_until"]


def test_quiet_hours_not_applied_to_reply(env):
    from receptionist.service import config_repo, sms_policy
    from datetime import datetime, timezone
    config_repo.save("t_a", {"sms_quiet_hours": {"enabled": True, "start_hour": 0, "end_hour": 23,
                                                 "timezone": "UTC", "days": [0, 1, 2, 3, 4, 5, 6]}}, updated_by="t")
    at = datetime(2026, 8, 17, 5, 0, tzinfo=timezone.utc)
    d = sms_policy.evaluate_send("t_a", to_number="+15559990000", responding_to_inbound=True, now=at)
    assert d["allowed"]


def test_direct_reply_gated(env, monkeypatch):
    monkeypatch.delenv("AI_RECEPTIONIST_SMS_DIRECT_REPLY_ENABLED", raising=False)
    from receptionist.service import config_repo, sms_policy
    config_repo.save("t_a", {"sms_reply_mode": "direct_reply"}, updated_by="t")
    assert sms_policy.reply_mode("t_a") == "approval_required"
    monkeypatch.setenv("AI_RECEPTIONIST_SMS_DIRECT_REPLY_ENABLED", "1")
    assert sms_policy.reply_mode("t_a") == "direct_reply"


# ── send handler ──────────────────────────────────────────────────────────────

def test_send_handler_provider_pending(env):
    from receptionist.service.registry import _h_sms_send
    res = _h_sms_send("t_a", {"to": "+15559990000", "body": "hi", "sender_number": "+15550001111",
                              "responding_to_inbound": True})
    assert res["status"] == "provider_pending" and res["record_id"] == "SM1"


def test_send_handler_suppressed(env):
    from receptionist.service import sms_sync
    from receptionist.service.registry import _h_sms_send
    sms_sync._record_opt_out("t_a", "+15559990000")
    res = _h_sms_send("t_a", {"to": "+15559990000", "body": "hi", "sender_number": "+15550001111"})
    assert res["status"] == "suppressed"


def test_send_handler_quiet_hours_delayed(env):
    from receptionist.service import config_repo
    from receptionist.service.registry import _h_sms_send
    config_repo.save("t_a", {"sms_quiet_hours": {"enabled": True, "start_hour": 0, "end_hour": 23,
                                                 "timezone": "UTC", "days": [0, 1, 2, 3, 4, 5, 6]}}, updated_by="t")
    res = _h_sms_send("t_a", {"to": "+15559990000", "body": "hi", "sender_number": "+15550001111",
                              "responding_to_inbound": False})
    assert res["status"] == "delayed_quiet_hours"


# ── status ────────────────────────────────────────────────────────────────────

def test_status_amends_draft(env):
    from receptionist.service import sms_sync, stores
    d = sms_sync.save_draft("t_a", {"status": "provider_pending", "provider_message_id": "SM1",
                                    "customer_number": "+15559990000"})
    sms_sync.process_status("t_a", {"MessageSid": "SM1", "MessageStatus": "delivered"})
    assert stores.sms_drafts().get("t_a", d["id"])["status"] == "delivered"


def test_status_failed_suppresses_invalid(env):
    from receptionist.service import sms_sync
    sms_sync.save_draft("t_a", {"status": "provider_pending", "provider_message_id": "SM9",
                                "customer_number": "+15559990000"})
    sms_sync.process_status("t_a", {"MessageSid": "SM9", "MessageStatus": "failed", "ErrorCode": "21211"})
    assert sms_sync.is_suppressed("t_a", "+15559990000")


# ── number selection ownership ────────────────────────────────────────────────

def test_select_number_ownership(env):
    from receptionist.service import sms_assets
    ok = sms_assets.select_number("t_a", "+15550001111")
    assert ok["status"] == "selected"
    denied = sms_assets.select_number("t_a", "+19998887777")
    assert denied["status"] == "number_not_owned"
    no_sms = sms_assets.select_number("t_a", "+15550002222")
    assert no_sms["status"] == "number_not_sms_capable"
