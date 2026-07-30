"""Telegram channel — adapter, webhook, standard + business inbound, callbacks,
edits/deletes, policy, sends, compliance (Wave 15). Hermetic: mock transport
injected; NO live Telegram calls.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from receptionist.providers import telegram_adapter as TG

BASE = "/api/agents/ai-receptionist"
SECRET = "wh-secret"
WEBHOOK_ID = "tgwh_abc"


class _Tx(TG.TelegramTransport):
    def __init__(self):
        self.sends = 0
    def get_me(self, token):
        return {"ok": True, "result": {"id": 111, "username": "acme_bot", "first_name": "Acme"}}
    def set_webhook(self, token, url, secret, allowed_updates): return {"ok": True, "result": True}
    def get_webhook_info(self, token):
        return {"ok": True, "result": {"url": "https://x", "pending_update_count": 0, "allowed_updates": ["message"]}}
    def delete_webhook(self, token): return {"ok": True, "result": True}
    def send_message(self, token, payload):
        self.sends += 1
        return {"ok": True, "result": {"message_id": 5000 + self.sends, "chat": {"id": payload.get("chat_id", "")}}}
    def edit_message(self, token, payload):
        return {"ok": True, "result": {"message_id": payload.get("message_id"), "chat": {"id": payload.get("chat_id")}}}
    def delete_message(self, token, chat_id, message_id): return {"ok": True, "result": True}
    def answer_callback_query(self, token, cid, text): return {"ok": True, "result": True}
    def send_chat_action(self, token, chat_id, action): return {"ok": True}
    def send_media(self, token, method, payload):
        self.sends += 1
        return {"ok": True, "result": {"message_id": 6000 + self.sends, "chat": {"id": payload.get("chat_id")}}}
    def get_file(self, token, file_id):
        return {"ok": True, "result": {"file_id": file_id, "file_unique_id": "u1", "file_path": "p/x.jpg", "file_size": 512}}
    def download_file(self, token, file_path): return b"x"
    def get_business_connection(self, token, bcid):
        return {"ok": True, "result": {"id": bcid, "user": {"id": 555}, "is_enabled": True, "rights": {"can_reply": True}}}


def _register(tenant="t_a", *, business=False):
    from integrations import connections
    desc = {"provider": "telegram", "status": "active", "bot_token": "123:ABC", "bot_id": "111",
            "bot_username": "acme_bot", "messaging_enabled": True, "standard_enabled": True,
            "webhook_subscribed": True, "webhook_id": WEBHOOK_ID, "webhook_secret": SECRET}
    if business:
        desc.update({"business_enabled": True, "business_connection_id": "bc_1", "business_user_id": "555",
                     "business_can_reply": True, "business_paused": False})
    connections.register_many(tenant, ["telegram_read", "telegram_send"], desc)


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
    tx = _Tx(); TG.set_transport(tx)
    _register(business=True)
    yield tx
    TG.set_transport(None); stores.reset_all()


@pytest.fixture()
def client(env, monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    import app
    return TestClient(app.app)


def _webhook(client, update, secret=SECRET):
    return client.post(f"{BASE}/telegram/webhook/{WEBHOOK_ID}", content=json.dumps(update).encode(),
                       headers={"x-telegram-bot-api-secret-token": secret, "content-type": "application/json"})


# ── adapter ───────────────────────────────────────────────────────────────────

def test_validate_connection_states(env):
    v = TG.validate_connection("t_a")
    assert v["connected"] and v["state"] == "standard_bot_ready"
    assert v["business"]["state"] == "ready_for_business_messages"


def test_validate_bot(env):
    b = TG.validate_bot("t_a")
    assert b["bot_id"] == "111" and b["bot_username"] == "acme_bot"


def test_business_paused_state(env):
    from integrations import connections
    _register(business=True)
    base = connections.find_active_connection_unsealed("t_a", "telegram_read")
    base = dict(base); base["business_paused"] = True
    connections.register_many("t_a", ["telegram_read", "telegram_send"], base)
    assert TG.validate_connection("t_a")["business"]["state"] == "business_connection_paused"


# ── webhook ───────────────────────────────────────────────────────────────────

def test_webhook_valid_secret_enqueues(client):
    upd = {"update_id": 1, "message": {"message_id": 10, "chat": {"id": 900, "type": "private"},
           "from": {"id": 900, "username": "sam"}, "text": "hi"}}
    r = _webhook(client, upd)
    assert r.status_code == 200 and r.json().get("enqueued") is True


def test_webhook_forged_secret_rejected(client):
    upd = {"update_id": 2, "message": {"message_id": 11, "chat": {"id": 900}, "text": "hi"}}
    r = _webhook(client, upd, secret="wrong")
    assert r.status_code == 403


def test_webhook_unknown_bot_ignored(client):
    upd = {"update_id": 3, "message": {"message_id": 12, "chat": {"id": 900}, "text": "hi"}}
    r = client.post(f"{BASE}/telegram/webhook/tgwh_UNKNOWN", content=json.dumps(upd).encode(),
                    headers={"x-telegram-bot-api-secret-token": SECRET})
    assert r.json().get("skipped") == "unknown_bot"


def test_webhook_oversized_rejected(client):
    big = json.dumps({"x": "y" * 1_100_000}).encode()
    r = client.post(f"{BASE}/telegram/webhook/{WEBHOOK_ID}", content=big,
                    headers={"x-telegram-bot-api-secret-token": SECRET})
    assert r.status_code == 413


def test_webhook_malformed_json(client):
    r = client.post(f"{BASE}/telegram/webhook/{WEBHOOK_ID}", content=b"{not json",
                    headers={"x-telegram-bot-api-secret-token": SECRET})
    assert r.status_code == 400


def test_webhook_duplicate_update_deduped(client):
    upd = {"update_id": 7, "message": {"message_id": 70, "chat": {"id": 900, "type": "private"},
           "from": {"id": 900}, "text": "hi"}}
    _webhook(client, upd)
    r2 = _webhook(client, upd)
    assert r2.json().get("deduped") is True


def test_webhook_cross_workspace_forged_tenant_ignored(client):
    upd = {"update_id": 8, "tenant_id": "attacker", "message": {"message_id": 80,
           "chat": {"id": 900, "type": "private"}, "from": {"id": 900}, "text": "hi", "tenant_id": "attacker"}}
    r = _webhook(client, upd)
    assert r.status_code == 200 and r.json().get("enqueued") is True  # resolved by webhook_id, not payload


def test_webhook_business_message_routes(client):
    upd = {"update_id": 9, "business_message": {"message_id": 90, "business_connection_id": "bc_1",
           "chat": {"id": 901, "type": "private"}, "from": {"id": 555}, "text": "hi"}}
    r = _webhook(client, upd)
    assert r.json().get("job") == "telegram_business_inbound"


# ── inbound processing ────────────────────────────────────────────────────────

def test_standard_inbound_draft_only(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_TELEGRAM_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import telegram_sync
    out = telegram_sync.process_message("t_a", mode="bot", message={
        "message_id": 1, "chat": {"id": 900, "type": "private"}, "from": {"id": 900, "username": "sam"}, "text": "hi"})
    assert out["status"] == "draft_only"


def test_bot_message_from_bot_ignored(env):
    from receptionist.service import telegram_sync
    out = telegram_sync.process_message("t_a", mode="bot", message={
        "message_id": 2, "chat": {"id": 900, "type": "private"}, "from": {"id": 42, "is_bot": True}, "text": "hi"})
    assert out["status"] == "bot_ignored"


def test_inbound_idempotent(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_TELEGRAM_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import telegram_sync
    m = {"message_id": 5, "chat": {"id": 900, "type": "private"}, "from": {"id": 900}, "text": "hi"}
    telegram_sync.process_message("t_a", mode="bot", message=m)
    assert telegram_sync.process_message("t_a", mode="bot", message=m)["status"] == "duplicate"


def test_business_inbound_uses_engine(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_TELEGRAM_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import telegram_sync
    out = telegram_sync.process_message("t_a", mode="business", message={
        "message_id": 6, "business_connection_id": "bc_1", "chat": {"id": 901, "type": "private"},
        "from": {"id": 555}, "text": "hello"})
    assert out["status"] == "draft_only"


def test_media_stored_non_conversational(env):
    from receptionist.service import telegram_sync, stores
    out = telegram_sync.process_message("t_a", mode="bot", message={
        "message_id": 7, "chat": {"id": 900, "type": "private"}, "from": {"id": 900},
        "photo": [{"file_id": "ph1"}]})
    assert out["status"] in ("draft_only", "stored_non_conversational")
    assert len(stores.tg_media().list("t_a")) == 1


def test_opt_out_suppresses(env):
    from receptionist.service import telegram_sync
    out = telegram_sync.process_message("t_a", mode="bot", message={
        "message_id": 8, "chat": {"id": 900, "type": "private"}, "from": {"id": 900}, "text": "/stop"})
    assert out["status"] == "opted_out"
    assert telegram_sync.is_suppressed("t_a", "900")


# ── callbacks ─────────────────────────────────────────────────────────────────

def test_callback_repository_backed_and_idempotent(env):
    from receptionist.service import telegram_sync
    telegram_sync.link_thread("t_a", "bot", "900", "conv_1")
    token = telegram_sync.create_callback("t_a", conversation_id="conv_1", action="pick_slot", option_id="SLOT_9")
    assert len(token) < 64  # fits Telegram callback_data
    res = telegram_sync.process_callback("t_a", {"id": "cbq1", "data": token})
    assert res["status"] == "processed" and res["conversation_id"] == "conv_1"
    # replay of the same callback query is deduped
    res2 = telegram_sync.process_callback("t_a", {"id": "cbq1", "data": token})
    assert res2["status"] == "duplicate"


def test_callback_unknown_token_refreshes(env):
    from receptionist.service import telegram_sync
    res = telegram_sync.process_callback("t_a", {"id": "cbq2", "data": "tgcb_nope"})
    assert res["status"] == "unknown_callback" and res["refresh"] is True


# ── edited / deleted ──────────────────────────────────────────────────────────

def test_edited_and_deleted_recorded(env):
    from receptionist.service import telegram_sync, stores
    telegram_sync.process_edited("t_a", "bot", {"message_id": 20, "chat": {"id": 900}, "text": "fixed"})
    telegram_sync.process_deleted("t_a", "business", "901", [30, 31])
    kinds = {e["kind"] for e in stores.tg_edits().list("t_a")}
    assert "edited_inbound" in kinds and "deleted_tombstone" in kinds


# ── business connection lifecycle ─────────────────────────────────────────────

def test_business_connection_update_remaps(env):
    from receptionist.service import telegram_sync
    from receptionist.providers import telegram_adapter as tg
    telegram_sync.process_business_connection("t_a", {"id": "bc_2", "user": {"id": 777},
                                                      "is_enabled": True, "rights": {"can_reply": True}})
    assert tg.validate_connection("t_a")["business"]["business_connection_id"] == "bc_2"


def test_business_disabled_blocks_send(env):
    from receptionist.service import telegram_sync
    from receptionist.service.registry import _h_telegram_business_send
    telegram_sync.process_business_connection("t_a", {"id": "bc_1", "user": {"id": 555},
                                                      "is_enabled": False, "rights": {"can_reply": True}})
    res = _h_telegram_business_send("t_a", {"chat_id": "901", "user_id": "555", "body": "hi",
                                            "business_connection_id": "bc_1"})
    assert res["status"] == "blocked_by_policy"


# ── policy + send ─────────────────────────────────────────────────────────────

def test_user_initiation_enforced(env):
    from receptionist.service.registry import _h_telegram_send
    # no prior inbound → blocked
    res = _h_telegram_send("t_a", {"chat_id": "999", "user_id": "999", "body": "hi"})
    assert res["status"] == "blocked_by_policy" and "not_initiated" in res["detail"]


def test_send_once_after_initiation(env):
    from receptionist.service import telegram_sync
    from receptionist.service.registry import _h_telegram_send
    telegram_sync._mark_initiated("t_a", "bot", "900")
    res = _h_telegram_send("t_a", {"chat_id": "900", "user_id": "900", "body": "hi"})
    assert res["status"] == "provider_pending" and res["record_id"]


def test_business_send_once(env):
    from receptionist.service.registry import _h_telegram_business_send
    res = _h_telegram_business_send("t_a", {"chat_id": "901", "user_id": "555", "body": "hi",
                                            "business_connection_id": "bc_1"})
    assert res["status"] == "provider_pending"


def test_forbidden_chat_terminal_suppression(env, monkeypatch):
    from receptionist.service import telegram_sync
    from receptionist.service.registry import _h_telegram_send

    class _Forbidden(_Tx):
        def send_message(self, token, payload):
            raise TG.TelegramError("forbidden_chat", "bot blocked")
    TG.set_transport(_Forbidden())
    telegram_sync._mark_initiated("t_a", "bot", "900")
    res = _h_telegram_send("t_a", {"chat_id": "900", "user_id": "900", "body": "hi"})
    assert res["status"] == "failed" and "forbidden_chat" in res["detail"]
    assert telegram_sync.is_suppressed("t_a", "900")
