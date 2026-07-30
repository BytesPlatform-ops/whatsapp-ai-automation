"""WhatsApp Cloud API — adapter, webhook, inbound, window, templates (Wave 12).

Hermetic: a mock WhatsApp transport is injected; NO live Meta calls. Covers asset
discovery, webhook verification/signature/dedup, inbound text + interactive + media,
window policy, reply modes, send-once, template validation, suppression/opt-out.
"""

from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from receptionist.providers import whatsapp_cloud as WA

BASE = "/api/agents/ai-receptionist"


class _Tx(WA.WhatsAppTransport):
    def __init__(self):
        self.sends = 0
    def list_business_accounts(self, token): return {"data": [{"id": "waba_1", "name": "Acme"}]}
    def list_phone_numbers(self, token, waba_id):
        return {"data": [{"id": "pn_1", "display_phone_number": "+15551230000", "verified_name": "Acme",
                          "quality_rating": "GREEN", "code_verification_status": "VERIFIED"}]}
    def get_phone_number(self, token, pid): return {"id": pid, "display_phone_number": "+15551230000"}
    def send_message(self, token, pid, payload):
        self.sends += 1
        return {"messages": [{"id": f"wamid.{self.sends}"}], "contacts": [{"wa_id": payload.get("to", "")}]}
    def mark_read(self, token, pid, mid): return {"success": True}
    def get_media(self, token, media_id): return {"url": "https://lookaside.fbsbx.com/x", "mime_type": "image/jpeg", "file_size": 512}
    def download_media(self, token, url): return b"jpegbytes"
    def list_templates(self, token, waba_id):
        return {"data": [{"id": "t1", "name": "appointment_reminder", "language": "en_US", "category": "UTILITY",
                          "status": "APPROVED", "components": [{"type": "BODY", "text": "Hi {{1}} at {{2}}"}]},
                         {"id": "t2", "name": "old_promo", "language": "en_US", "category": "MARKETING",
                          "status": "REJECTED", "components": [{"type": "BODY", "text": "{{1}}"}]}]}


def _register(tenant="t_a", pid="pn_1", send=True):
    from integrations import connections
    caps = ["whatsapp_read"] + (["whatsapp_send"] if send else [])
    connections.register_many(tenant, caps, {
        "provider": "meta", "status": "active", "waba_id": "waba_1", "waba_name": "Acme",
        "phone_number_id": pid, "display_phone_number": "+15551230000", "verified_name": "Acme",
        "access_token": "tok", "messaging_enabled": True, "template_enabled": True,
        "webhook_subscribed": True})


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    monkeypatch.setenv("META_APP_SECRET", "webhook-secret")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    from integrations import connections, webhook_events
    stores.reset_all(); jobs_store.reset_stores(); connections.clear_connections()
    try: webhook_events._reset_repos()
    except Exception: pass
    tx = _Tx(); WA.set_transport(tx)
    _register()
    yield tx
    WA.set_transport(None); stores.reset_all()


# ── adapter / discovery ───────────────────────────────────────────────────────

def test_validate_connection_ready(env):
    v = WA.validate_connection("t_a")
    assert v["connected"] and v["can_send"] and v["can_template"] and v["state"] == "ready_for_templates"


def test_list_wabas_and_numbers(env):
    assert WA.list_business_accounts("t_a")[0]["waba_id"] == "waba_1"
    nums = WA.list_phone_numbers("t_a", "waba_1")
    assert nums[0]["phone_number_id"] == "pn_1"


def test_send_text_confirmed(env):
    r = WA.send_text("t_a", to="15559876543", body="hi")
    assert r["message_id"] and env.sends == 1


def test_invalid_recipient_rejected(env):
    with pytest.raises(WA.WhatsAppError) as e:
        WA.send_text("t_a", to="not-a-number", body="x")
    assert e.value.category == "invalid_recipient"


def test_media_download_size_guard(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_WHATSAPP_MAX_MEDIA_BYTES", "10")
    class _Big(_Tx):
        def get_media(self, t, m): return {"url": "u", "mime_type": "image/jpeg", "file_size": 9999}
    WA.set_transport(_Big())
    with pytest.raises(WA.WhatsAppError) as e:
        WA.download_media("t_a", "m1")
    assert e.value.category == "media_too_large"


# ── webhook ───────────────────────────────────────────────────────────────────

def _client():
    import app
    return TestClient(app.app)


def _sign(raw: bytes) -> str:
    return "sha256=" + hmac.new(b"webhook-secret", raw, hashlib.sha256).hexdigest()


def _inbound_body(pid="pn_1", wa="15559990000", mid="wamid.IN1", text="hello"):
    return {"entry": [{"changes": [{"value": {
        "metadata": {"phone_number_id": pid},
        "contacts": [{"wa_id": wa, "profile": {"name": "Sam"}}],
        "messages": [{"id": mid, "from": wa, "type": "text", "timestamp": "1", "text": {"body": text}}]}}]}]}


def test_webhook_verify_challenge(env, monkeypatch):
    monkeypatch.setenv("META_WEBHOOK_VERIFY_TOKEN", "vtok")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    r = _client().get(f"{BASE}/whatsapp/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "vtok", "hub.challenge": "42"})
    assert r.status_code == 200 and r.text == "42"


def test_webhook_bad_signature_rejected(env, monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    body = json.dumps(_inbound_body()).encode()
    r = _client().post(f"{BASE}/whatsapp/webhook", content=body,
                       headers={"Content-Type": "application/json", "X-Hub-Signature-256": "sha256=bad"})
    assert r.status_code == 403


def test_webhook_valid_signature_enqueues(env, monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    body = json.dumps(_inbound_body()).encode()
    r = _client().post(f"{BASE}/whatsapp/webhook", content=body,
                       headers={"Content-Type": "application/json", "X-Hub-Signature-256": _sign(body)})
    assert r.status_code == 200 and r.json()["enqueued"] == 1
    from receptionist.worker import jobs_store
    assert any(j["job_type"] == "whatsapp_inbound" for _i, j in jobs_store.due_jobs(limit=20))


def test_webhook_unknown_phone_ignored(env, monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    body = json.dumps(_inbound_body(pid="pn_UNKNOWN")).encode()
    r = _client().post(f"{BASE}/whatsapp/webhook", content=body,
                       headers={"Content-Type": "application/json", "X-Hub-Signature-256": _sign(body)})
    assert r.json()["enqueued"] == 0 and r.json()["skipped"] == 1


def test_webhook_duplicate_message_once(env, monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    body = json.dumps(_inbound_body(mid="dup")).encode()
    c = _client()
    c.post(f"{BASE}/whatsapp/webhook", content=body, headers={"Content-Type": "application/json", "X-Hub-Signature-256": _sign(body)})
    r2 = c.post(f"{BASE}/whatsapp/webhook", content=body, headers={"Content-Type": "application/json", "X-Hub-Signature-256": _sign(body)})
    assert r2.json()["enqueued"] == 0


def test_webhook_oversized_rejected(env, monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    r = _client().post(f"{BASE}/whatsapp/webhook", content=b"x" * 600_000,
                       headers={"Content-Type": "application/json", "X-Hub-Signature-256": "sha256=x"})
    assert r.status_code == 413


# ── inbound + window + reply modes ────────────────────────────────────────────

def test_inbound_draft_only(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_WHATSAPP_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import whatsapp_sync
    msg = {"id": "m1", "from": "15559990000", "type": "text", "timestamp": "1", "text": {"body": "what are your hours?"}}
    out = whatsapp_sync.process_message("t_a", phone_number_id="pn_1", message=msg, contacts=[{"wa_id": "15559990000", "profile": {"name": "Sam"}}])
    assert out["status"] == "draft_only" and out["draft_id"]
    assert env.sends == 0
    # thread maps to one conversation
    assert whatsapp_sync.conversation_for("t_a", "pn_1", "15559990000") == out["conversation_id"]


def test_inbound_duplicate_idempotent(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_WHATSAPP_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import whatsapp_sync, stores
    msg = {"id": "m2", "from": "15559990000", "type": "text", "timestamp": "1", "text": {"body": "hi"}}
    whatsapp_sync.process_message("t_a", phone_number_id="pn_1", message=msg)
    out2 = whatsapp_sync.process_message("t_a", phone_number_id="pn_1", message=msg)
    assert out2["status"] == "duplicate" and stores.wa_drafts().count("t_a") == 1


def test_window_opens_on_inbound(env):
    from receptionist.service import whatsapp_window
    whatsapp_window.record_inbound("t_a", phone_number_id="pn_1", wa_id="15559990000")
    st = whatsapp_window.window_state("t_a", phone_number_id="pn_1", wa_id="15559990000")
    assert st["open"] and st["free_form_allowed"] and not st["template_required"]


def test_window_closed_requires_template(env):
    from receptionist.service import whatsapp_window
    st = whatsapp_window.window_state("t_a", phone_number_id="pn_1", wa_id="15551112222")
    assert not st["open"] and st["template_required"]


def test_approval_mode_sends_once(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_WHATSAPP_DEFAULT_REPLY_MODE", "approval_required")
    from receptionist.service import whatsapp_sync, registry
    import approvals.router as ar
    ar._store = None; ar._executors_by_agent.clear(); ar._executor = None
    registry._EXECUTOR_REGISTERED = False; registry._ensure_executor_registered()
    msg = {"id": "m3", "from": "15559990000", "type": "text", "timestamp": "1", "text": {"body": "book me"}}
    out = whatsapp_sync.process_message("t_a", phone_number_id="pn_1", message=msg)
    assert out["status"] == "approval_required" and env.sends == 0
    from approvals.router import approve, ResolveBody
    approve(out["approval_id"], ResolveBody(tenant_id="t_a"))
    assert env.sends == 1
    approve(out["approval_id"], ResolveBody(tenant_id="t_a"))  # duplicate
    assert env.sends == 1


def test_interactive_inbound_enters_engine(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_WHATSAPP_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import whatsapp_sync
    msg = {"id": "m4", "from": "15559990000", "type": "interactive", "timestamp": "1",
           "interactive": {"type": "button_reply", "button_reply": {"id": "svc_haircut", "title": "Haircut"}}}
    out = whatsapp_sync.process_message("t_a", phone_number_id="pn_1", message=msg)
    assert out["status"] == "draft_only"


def test_media_inbound_stored_not_ingested(env):
    from receptionist.service import whatsapp_sync, stores
    msg = {"id": "m5", "from": "15559990000", "type": "image", "timestamp": "1", "image": {"id": "media_1"}}
    out = whatsapp_sync.process_message("t_a", phone_number_id="pn_1", message=msg)
    assert out["status"] == "stored_non_conversational"
    assert stores.wa_media().count("t_a") == 1


def test_opt_out_persists_suppression(env):
    from receptionist.service import whatsapp_sync, stores
    msg = {"id": "m6", "from": "15559990000", "type": "text", "timestamp": "1", "text": {"body": "STOP"}}
    out = whatsapp_sync.process_message("t_a", phone_number_id="pn_1", message=msg)
    assert out["status"] == "opted_out"
    assert whatsapp_sync.is_suppressed("t_a", "15559990000")


def test_suppressed_recipient_not_sent(env):
    from receptionist.service import registry, stores, whatsapp_window
    from receptionist.service.schemas import OptOut
    stores.optouts().put("t_a", OptOut(tenant_id="t_a", phone="+15559990000", channel="whatsapp").model_dump())
    whatsapp_window.record_inbound("t_a", phone_number_id="pn_1", wa_id="15559990000")
    res = registry._h_whatsapp_send("t_a", {"to": "15559990000", "body": "hi", "phone_number_id": "pn_1"})
    assert res["status"] == "suppressed" and env.sends == 0


def test_send_outside_window_requires_template(env):
    from receptionist.service import registry
    res = registry._h_whatsapp_send("t_a", {"to": "15551112222", "body": "hi", "phone_number_id": "pn_1"})
    assert res["status"] == "template_required" and env.sends == 0


# ── templates ─────────────────────────────────────────────────────────────────

def test_template_sync_and_validation(env):
    from receptionist.service import whatsapp_templates
    r = whatsapp_templates.sync("t_a")
    assert r["synced"] == 2
    ok, _ = whatsapp_templates.validate_for_send("t_a", "appointment_reminder", ["Sam", "3pm"])
    assert ok
    bad, reason = whatsapp_templates.validate_for_send("t_a", "appointment_reminder", ["Sam"])
    assert not bad and reason == "variable_mismatch"
    rej, reason2 = whatsapp_templates.validate_for_send("t_a", "old_promo", ["x"])
    assert not rej and reason2 == "not_approved"


def test_template_send_via_registry(env):
    from receptionist.service import whatsapp_templates, registry
    whatsapp_templates.sync("t_a")
    res = registry._h_whatsapp_send_template("t_a", {"to": "15551112222", "template_name": "appointment_reminder",
                                                     "variables": ["Sam", "3pm"], "draft_id": ""})
    assert res["status"] == "provider_pending" and env.sends == 1


def test_status_update_amends_draft(env):
    from receptionist.service import whatsapp_sync, stores
    d = whatsapp_sync.save_draft("t_a", {"wa_id": "15559990000", "text": "hi", "status": "provider_pending",
                                         "provider_message_id": "wamid.X"})
    whatsapp_sync.process_status("t_a", {"id": "wamid.X", "status": "delivered"})
    assert stores.wa_drafts().get("t_a", d["id"])["status"] == "delivered"
    # read advances; a late 'sent' does not regress
    whatsapp_sync.process_status("t_a", {"id": "wamid.X", "status": "read"})
    whatsapp_sync.process_status("t_a", {"id": "wamid.X", "status": "sent"})
    assert stores.wa_drafts().get("t_a", d["id"])["status"] == "read"
