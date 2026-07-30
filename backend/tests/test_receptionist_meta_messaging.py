"""Meta Messaging (Instagram + Messenger) — adapters, webhook, inbound, policy,
sends, statuses, compliance (Wave 13). Hermetic: mock transports injected; NO live
Meta calls.
"""

from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from receptionist.providers import instagram_messaging as IG
from receptionist.providers import messenger as FB

BASE = "/api/agents/ai-receptionist"


class _IGTx(IG.InstagramTransport):
    def __init__(self):
        self.sends = 0
    def list_accounts(self, token):
        return {"data": [{"id": "ig_1", "username": "acme.co", "account_type": "BUSINESS",
                          "page_id": "page_1", "messaging_capability": True}]}
    def get_account(self, token, ig_account_id):
        return {"id": ig_account_id, "username": "acme.co", "account_type": "BUSINESS", "page_id": "page_1"}
    def send_message(self, token, ig_account_id, payload):
        self.sends += 1
        return {"message_id": f"ig.{self.sends}", "recipient_id": (payload.get("recipient") or {}).get("id", "")}
    def mark_seen(self, token, ig_account_id, recipient_id): return {"success": True}
    def get_media(self, token, media_id): return {"url": "https://x", "mime_type": "image/jpeg", "file_size": 8}
    def download_media(self, token, url): return b"x"


class _FBTx(FB.MessengerTransport):
    def __init__(self):
        self.sends = 0
    def list_pages(self, token):
        return {"data": [{"id": "page_1", "name": "Acme Ltd", "category": "biz",
                          "messaging_capability": True, "access_token": "pat"}]}
    def get_page(self, token, page_id): return {"id": page_id, "name": "Acme Ltd"}
    def send_message(self, token, page_id, payload):
        self.sends += 1
        return {"message_id": f"mid.{self.sends}", "recipient_id": (payload.get("recipient") or {}).get("id", "")}
    def send_sender_action(self, token, page_id, recipient_id, action): return {"recipient_id": recipient_id}
    def get_media(self, token, media_id): return {"url": "https://x", "mime_type": "image/png", "file_size": 8}
    def download_media(self, token, url): return b"x"


def _register(tenant="t_a"):
    from integrations import connections
    connections.register_many(tenant, ["instagram_read", "instagram_send"], {
        "provider": "meta", "status": "active", "instagram_account_id": "ig_1", "username": "acme.co",
        "linked_page_id": "page_1", "account_type": "BUSINESS", "access_token": "tok",
        "messaging_enabled": True, "messaging_permission": True, "webhook_subscribed": True})
    connections.register_many(tenant, ["messenger_read", "messenger_send"], {
        "provider": "meta", "status": "active", "page_id": "page_1", "page_name": "Acme Ltd",
        "page_access_token": "pat", "access_token": "tok",
        "messaging_enabled": True, "messaging_permission": True, "webhook_subscribed": True})


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
    ig, fb = _IGTx(), _FBTx()
    IG.set_transport(ig); FB.set_transport(fb)
    _register()
    yield ig, fb
    IG.set_transport(None); FB.set_transport(None); stores.reset_all()


def _sign(raw: bytes) -> str:
    return "sha256=" + hmac.new(b"webhook-secret", raw, hashlib.sha256).hexdigest()


def _post_webhook(client, body: dict):
    raw = json.dumps(body).encode()
    return client.post(f"{BASE}/meta-messaging/webhook", content=raw,
                       headers={"x-hub-signature-256": _sign(raw), "content-type": "application/json"})


@pytest.fixture()
def client(env, monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.setenv("META_WEBHOOK_VERIFY_TOKEN", "vtok")
    import app
    return TestClient(app.app)


# ── adapters + discovery ──────────────────────────────────────────────────────

def test_instagram_validate_and_discovery(env):
    v = IG.validate_connection("t_a")
    assert v["connected"] and v["state"] == "ready_for_replies" and v["can_send"]
    accts = IG.list_accounts("t_a")
    assert accts[0]["instagram_account_id"] == "ig_1" and accts[0]["username"] == "acme.co"


def test_messenger_validate_and_discovery(env):
    v = FB.validate_connection("t_a")
    assert v["connected"] and v["state"] == "ready_for_replies"
    pages = FB.list_pages("t_a")
    assert pages[0]["page_id"] == "page_1"


def test_readiness_never_green_without_page(env):
    from integrations import connections
    connections.register_many("t_b", ["messenger_read"], {"status": "active", "messaging_permission": True})
    v = FB.validate_connection("t_b")
    assert v["state"] == "no_facebook_page" and not v.get("can_send")


def test_instagram_send_once(env):
    ig, _ = env
    from receptionist.service import meta_messaging_policy
    meta_messaging_policy.record_inbound("t_a", channel="instagram", asset_id="ig_1", sender_id="5551")
    res = IG.send_text("t_a", to="5551", body="hi")
    assert res["message_id"] == "ig.1" and ig.sends == 1


def test_messenger_quick_replies_typed(env):
    _, fb = env
    res = FB.send_quick_replies("t_a", to="5551", text="Pick", quick_replies=[
        {"title": "9am", "payload": "SLOT_9"}, {"title": "10am", "payload": "SLOT_10"}])
    assert res["message_id"] == "mid.1"


def test_messenger_rejects_obsolete_tag(env):
    from receptionist.providers.meta_messaging_common import MetaMessagingError
    with pytest.raises(MetaMessagingError) as e:
        FB.send_text("t_a", to="5551", body="hi", tag="NON_PROMOTIONAL_SUBSCRIPTION")
    assert e.value.category == "invalid_tag"


def test_media_size_guard(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_META_MESSAGING_MAX_MEDIA_BYTES", "4")
    from receptionist.providers.meta_messaging_common import MetaMessagingError

    class _Big(_IGTx):
        def get_media(self, token, media_id): return {"url": "https://x", "mime_type": "image/jpeg", "file_size": 999}
    IG.set_transport(_Big())
    with pytest.raises(MetaMessagingError) as e:
        IG.download_media("t_a", "m1")
    assert e.value.category == "media_too_large"


# ── webhook ───────────────────────────────────────────────────────────────────

def test_webhook_verify_challenge(client):
    r = client.get(f"{BASE}/meta-messaging/webhook",
                   params={"hub.mode": "subscribe", "hub.verify_token": "vtok", "hub.challenge": "42"})
    assert r.status_code == 200 and r.text == "42"


def test_webhook_bad_signature_rejected(client):
    raw = json.dumps({"object": "instagram", "entry": []}).encode()
    r = client.post(f"{BASE}/meta-messaging/webhook", content=raw,
                    headers={"x-hub-signature-256": "sha256=bad"})
    assert r.status_code == 403


def test_webhook_oversized_rejected(client):
    raw = b"x" * 1_100_000
    r = client.post(f"{BASE}/meta-messaging/webhook", content=raw,
                    headers={"x-hub-signature-256": _sign(raw)})
    assert r.status_code == 413


def test_webhook_instagram_event_enqueues(client, env):
    body = {"object": "instagram", "entry": [{"id": "ig_1", "messaging": [
        {"sender": {"id": "5551"}, "recipient": {"id": "ig_1"}, "timestamp": 1,
         "message": {"mid": "m_ig_1", "text": "hello"}}]}]}
    r = _post_webhook(client, body)
    assert r.status_code == 200 and r.json()["enqueued"] == 1


def test_webhook_messenger_event_enqueues(client, env):
    body = {"object": "page", "entry": [{"id": "page_1", "messaging": [
        {"sender": {"id": "5552"}, "recipient": {"id": "page_1"}, "timestamp": 1,
         "message": {"mid": "m_fb_1", "text": "hey"}}]}]}
    r = _post_webhook(client, body)
    assert r.status_code == 200 and r.json()["enqueued"] == 1


def test_webhook_unknown_asset_skipped(client, env):
    body = {"object": "page", "entry": [{"id": "page_UNKNOWN", "messaging": [
        {"sender": {"id": "5"}, "message": {"mid": "x", "text": "hi"}}]}]}
    r = _post_webhook(client, body)
    assert r.json()["skipped"] == 1 and r.json()["enqueued"] == 0


def test_webhook_duplicate_event_deduped(client, env):
    body = {"object": "instagram", "entry": [{"id": "ig_1", "messaging": [
        {"sender": {"id": "5551"}, "message": {"mid": "dup_1", "text": "hi"}}]}]}
    _post_webhook(client, body)
    r2 = _post_webhook(client, body)
    assert r2.json()["enqueued"] == 0


def test_webhook_cross_workspace_ignored(client, env):
    # a forged tenant field in the payload must be ignored (asset resolves ownership)
    body = {"object": "instagram", "tenant_id": "attacker", "entry": [{"id": "ig_UNKNOWN",
            "tenant_id": "attacker", "messaging": [{"sender": {"id": "5"}, "message": {"mid": "z", "text": "x"}}]}]}
    r = _post_webhook(client, body)
    assert r.json()["enqueued"] == 0 and r.json()["skipped"] == 1


# ── inbound processing ────────────────────────────────────────────────────────

def test_instagram_inbound_draft_only(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_INSTAGRAM_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import meta_messaging_sync
    ev = {"sender": {"id": "5551"}, "recipient": {"id": "ig_1"}, "message": {"mid": "m1", "text": "hi"}}
    out = meta_messaging_sync.process_message("t_a", channel="instagram", asset_id="ig_1", event=ev)
    assert out["status"] == "draft_only" and out["draft_id"]


def test_messenger_postback_enters_engine(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_MESSENGER_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import meta_messaging_sync
    ev = {"sender": {"id": "5552"}, "recipient": {"id": "page_1"},
          "postback": {"mid": "p1", "title": "Book now", "payload": "BOOK"}}
    out = meta_messaging_sync.process_message("t_a", channel="messenger", asset_id="page_1", event=ev)
    assert out["status"] == "draft_only"


def test_echo_message_ignored(env):
    from receptionist.service import meta_messaging_sync
    ev = {"sender": {"id": "page_1"}, "recipient": {"id": "5552"},
          "message": {"mid": "e1", "text": "our reply", "is_echo": True}}
    out = meta_messaging_sync.process_message("t_a", channel="messenger", asset_id="page_1", event=ev)
    assert out["status"] == "echo_ignored"


def test_inbound_idempotent(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_INSTAGRAM_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import meta_messaging_sync
    ev = {"sender": {"id": "5551"}, "message": {"mid": "same", "text": "hi"}}
    meta_messaging_sync.process_message("t_a", channel="instagram", asset_id="ig_1", event=ev)
    out2 = meta_messaging_sync.process_message("t_a", channel="instagram", asset_id="ig_1", event=ev)
    assert out2["status"] == "duplicate"


def test_media_dm_stored_non_conversational(env):
    from receptionist.service import meta_messaging_sync, stores
    ev = {"sender": {"id": "5551"}, "message": {"mid": "md1", "attachments": [
        {"type": "image", "payload": {"id": "att1", "url": "https://x"}}]}}
    out = meta_messaging_sync.process_message("t_a", channel="instagram", asset_id="ig_1", event=ev)
    assert out["status"] == "stored_non_conversational"
    assert len(stores.meta_media().list("t_a")) == 1


def test_story_mention_metadata(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_INSTAGRAM_DEFAULT_REPLY_MODE", "draft_only")
    from receptionist.service import meta_messaging_sync
    ev = {"sender": {"id": "5551"}, "message": {"mid": "s1", "text": "loved your story",
          "attachments": [{"type": "story_mention", "payload": {"url": "https://ig/story"}}]}}
    out = meta_messaging_sync.process_message("t_a", channel="instagram", asset_id="ig_1", event=ev)
    # has text → enters engine as a draft with story context recorded
    assert out["status"] == "draft_only"


# ── policy + reply modes ──────────────────────────────────────────────────────

def test_policy_window_open_then_expired(env):
    from receptionist.service import meta_messaging_policy
    from datetime import datetime, timezone, timedelta
    meta_messaging_policy.record_inbound("t_a", channel="instagram", asset_id="ig_1", sender_id="5551")
    st = meta_messaging_policy.window_state("t_a", channel="instagram", asset_id="ig_1", sender_id="5551")
    assert st["open"] and st["free_form_allowed"]
    later = datetime.now(timezone.utc) + timedelta(hours=25)
    st2 = meta_messaging_policy.window_state("t_a", channel="instagram", asset_id="ig_1", sender_id="5551", now=later)
    assert not st2["open"] and not st2["free_form_allowed"]


def test_messenger_tag_allowed_outside_window(env):
    from receptionist.service import meta_messaging_policy
    from datetime import datetime, timezone, timedelta
    meta_messaging_policy.record_inbound("t_a", channel="messenger", asset_id="page_1", sender_id="5552")
    later = datetime.now(timezone.utc) + timedelta(hours=25)
    d = meta_messaging_policy.evaluate_send("t_a", channel="messenger", asset_id="page_1", sender_id="5552",
                                            tag="ACCOUNT_UPDATE", now=later)
    assert d["allowed"] and d.get("used_tag") == "ACCOUNT_UPDATE"


def test_instagram_no_tag_outside_window(env):
    from receptionist.service import meta_messaging_policy
    from datetime import datetime, timezone, timedelta
    meta_messaging_policy.record_inbound("t_a", channel="instagram", asset_id="ig_1", sender_id="5551")
    later = datetime.now(timezone.utc) + timedelta(hours=25)
    d = meta_messaging_policy.evaluate_send("t_a", channel="instagram", asset_id="ig_1", sender_id="5551", now=later)
    assert not d["allowed"] and d["blocked_reason"] == "window_closed"


def test_direct_reply_gated_by_env(env, monkeypatch):
    monkeypatch.delenv("AI_RECEPTIONIST_INSTAGRAM_DIRECT_REPLY_ENABLED", raising=False)
    from receptionist.service import config_repo, meta_messaging_sync
    config_repo.save("t_a", {"instagram_reply_mode": "direct_reply"}, updated_by="test")
    assert meta_messaging_sync.reply_mode("t_a", "instagram") == "approval_required"
    monkeypatch.setenv("AI_RECEPTIONIST_INSTAGRAM_DIRECT_REPLY_ENABLED", "1")
    assert meta_messaging_sync.reply_mode("t_a", "instagram") == "direct_reply"


# ── drafts / send handlers ────────────────────────────────────────────────────

def test_send_handler_blocked_outside_window(env):
    from receptionist.service.registry import _h_instagram_send
    res = _h_instagram_send("t_a", {"to": "5551", "body": "hi", "asset_id": "ig_1"})
    assert res["status"] == "blocked_by_policy"


def test_send_handler_sends_inside_window(env):
    from receptionist.service import meta_messaging_policy
    from receptionist.service.registry import _h_instagram_send
    meta_messaging_policy.record_inbound("t_a", channel="instagram", asset_id="ig_1", sender_id="5551")
    res = _h_instagram_send("t_a", {"to": "5551", "body": "hi", "asset_id": "ig_1"})
    assert res["status"] == "provider_pending" and res["record_id"] == "ig.1"


def test_send_handler_suppressed(env):
    from receptionist.service import meta_messaging_sync, meta_messaging_policy
    from receptionist.service.registry import _h_messenger_send
    meta_messaging_policy.record_inbound("t_a", channel="messenger", asset_id="page_1", sender_id="5552")
    meta_messaging_sync._record_opt_out("t_a", "messenger", "5552")
    res = _h_messenger_send("t_a", {"to": "5552", "body": "hi", "asset_id": "page_1"})
    assert res["status"] == "suppressed"


def test_edit_draft_invalidates_approval(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_MESSENGER_DEFAULT_REPLY_MODE", "approval_required")
    from receptionist.service import meta_messaging_sync, meta_messaging_policy
    meta_messaging_policy.record_inbound("t_a", channel="messenger", asset_id="page_1", sender_id="5552")
    ev = {"sender": {"id": "5552"}, "message": {"mid": "m9", "text": "hi"}}
    out = meta_messaging_sync.process_message("t_a", channel="messenger", asset_id="page_1", event=ev)
    edited = meta_messaging_sync.edit_draft("t_a", out["draft_id"], text="new")
    assert edited["status"] == "generated" and edited["text"] == "new"


# ── status ────────────────────────────────────────────────────────────────────

def test_status_amends_draft(env):
    from receptionist.service import meta_messaging_sync, stores
    d = meta_messaging_sync.save_draft("t_a", {"channel": "messenger", "status": "provider_pending",
                                               "provider_message_id": "mid.1", "sender_id": "5552"})
    meta_messaging_sync.process_status("t_a", "messenger", {"mids": ["mid.1"], "status": "delivered"})
    got = stores.meta_drafts().get("t_a", d["id"])
    assert got["status"] == "delivered"
    # read does not regress; a duplicate delivered is harmless
    meta_messaging_sync.process_status("t_a", "messenger", {"watermark": "1", "status": "read"})
    # watermark-only read w/o mid match → no crash


# ── compliance ────────────────────────────────────────────────────────────────

def test_opt_out_suppresses_channel(env):
    from receptionist.service import meta_messaging_sync
    ev = {"sender": {"id": "5551"}, "message": {"mid": "o1", "text": "stop"}}
    out = meta_messaging_sync.process_message("t_a", channel="instagram", asset_id="ig_1", event=ev)
    assert out["status"] == "opted_out"
    assert meta_messaging_sync.is_suppressed("t_a", "instagram", "5551")
    # channel-scoped: messenger not suppressed by an instagram opt-out
    assert not meta_messaging_sync.is_suppressed("t_a", "messenger", "5551")


# ── asset selection ownership ─────────────────────────────────────────────────

def test_select_account_ownership_ok(env):
    from receptionist.service import meta_messaging_assets
    res = meta_messaging_assets.select_instagram_account("t_a", "ig_1")
    assert res["status"] == "selected"


def test_select_account_ownership_denied(env):
    from receptionist.service import meta_messaging_assets
    res = meta_messaging_assets.select_instagram_account("t_a", "ig_NOT_MINE")
    assert res["status"] == "asset_ownership_failed"
