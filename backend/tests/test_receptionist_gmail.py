"""AI Receptionist Gmail adapter + sync + reply modes (Wave 7).

Hermetic: a mock Gmail transport is injected; NO live Gmail calls. Proves scope
validation, normalisation + HTML sanitisation, header-injection safety, inbound
filtering, thread mapping, reply-mode policy, draft/approval flow, send-once, and
suppression.
"""

from __future__ import annotations

import base64

import pytest

from receptionist.providers import gmail as G


class _Tx(G.GmailTransport):
    def __init__(self):
        self.sends = 0
    def profile(self, token): return {"emailAddress": "business@example.com", "historyId": "10"}
    def list_messages(self, token, *, query, max_results, page_token=""):
        return {"messages": [{"id": "m1", "threadId": "t1"}]}
    def get_message(self, token, message_id):
        return {"id": message_id, "threadId": "t1", "historyId": "11", "labelIds": ["INBOX"],
                "snippet": "Are you open Saturday?",
                "payload": {"mimeType": "text/plain",
                            "headers": [{"name": "From", "value": "Sam <sam@example.com>"},
                                        {"name": "Subject", "value": "Hours"}],
                            "body": {"data": base64.urlsafe_b64encode(b"Are you open Saturday?").decode()}}}
    def history(self, token, start_history_id): return {"history": [], "historyId": "12"}
    def create_draft(self, token, raw, thread_id=""): return {"id": "d1", "message": {"id": "dm1"}}
    def send(self, token, raw, thread_id=""):
        self.sends += 1
        return {"id": f"sent{self.sends}", "threadId": thread_id or "t1"}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    from receptionist.service import stores
    stores.reset_all()
    # Register a Google connection with send scope for tenant t_a.
    from integrations import connections
    connections.clear_connections()
    connections.register_many("t_a", ["email_read", "email_send"], {
        "provider": "google", "status": "active", "email": "business@example.com",
        "access_token": "tok", "refresh_token": "r", "expires_at": 9_999_999_999,
        "scope": "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
    })
    tx = _Tx()
    G.set_transport(tx)
    yield tx
    G.set_transport(None)
    stores.reset_all()


# ── header-injection + validation ─────────────────────────────────────────────

def test_recipient_validation_blocks_header_injection():
    with pytest.raises(G.GmailError) as e:
        G.validate_recipient("a@b.com\r\nBcc: victim@x.com")
    assert e.value.category == "header_injection"


def test_invalid_recipient_rejected():
    with pytest.raises(G.GmailError) as e:
        G.validate_recipient("not-an-email")
    assert e.value.category == "invalid_recipient"


def test_html_to_text_strips_scripts():
    out = G.html_to_text("<p>Hi</p><script>evil()</script><b>there</b>")
    assert "evil()" not in out and "Hi" in out and "there" in out


def test_build_raw_reply_is_base64_and_bounded():
    raw = G.build_raw_reply(to="a@b.com", subject="Re: hi", body="hello")
    decoded = base64.urlsafe_b64decode(raw + "===").decode()
    assert "To: a@b.com" in decoded and "hello" in decoded


# ── filtering ─────────────────────────────────────────────────────────────────

def test_filter_bounce_and_autoreply():
    from receptionist.service import gmail_sync
    assert gmail_sync.filter_reason({"subject": "Out of office", "from": "x@y.com"}) == "auto_reply_or_bounce"
    assert gmail_sync.filter_reason({"subject": "hi", "from": "no-reply@y.com"}) == "no_reply_sender"
    assert gmail_sync.filter_reason({"subject": "hi", "from": "b@x.com", "labels": ["SPAM"]}) == "spam_or_trash"
    assert gmail_sync.filter_reason({"subject": "hi", "from": "c@x.com"}) is None


# ── sync + reply modes ────────────────────────────────────────────────────────

def test_draft_only_mode_creates_draft_no_send(_env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_GMAIL_REPLY_MODE", "draft_only")
    from receptionist.service import gmail_sync, stores
    out = gmail_sync.process_message("t_a", "m1")
    assert out["status"] == "draft_only" and out["draft_id"]
    assert _env.sends == 0
    assert stores.gmail_drafts().count("t_a") == 1
    # a Gmail thread maps to one conversation
    assert gmail_sync.conversation_for_thread("t_a", "t1") == out["conversation_id"]


def test_duplicate_message_is_idempotent(_env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_GMAIL_REPLY_MODE", "draft_only")
    from receptionist.service import gmail_sync, stores
    gmail_sync.process_message("t_a", "m1")
    out2 = gmail_sync.process_message("t_a", "m1")
    assert out2["status"] == "duplicate"
    assert stores.gmail_drafts().count("t_a") == 1  # no duplicate draft


def test_approval_mode_files_approval_and_sends_once(_env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_GMAIL_REPLY_MODE", "approval_required")
    from receptionist.service import gmail_sync, registry
    import approvals.router as ar
    ar._store = None; ar._executors_by_agent.clear(); ar._executor = None
    registry._EXECUTOR_REGISTERED = False; registry._ensure_executor_registered()

    out = gmail_sync.process_message("t_a", "m1")
    assert out["status"] == "approval_required" and out["approval_id"]
    assert _env.sends == 0  # nothing sent yet

    from approvals.router import approve, ResolveBody
    approve(out["approval_id"], ResolveBody(tenant_id="t_a"))
    assert _env.sends == 1  # sent exactly once on approval
    # duplicate approve does not resend
    approve(out["approval_id"], ResolveBody(tenant_id="t_a"))
    assert _env.sends == 1


def test_missing_send_scope_is_truthful(_env, monkeypatch):
    from integrations import connections
    connections.clear_connections()
    connections.register_many("t_a", ["email_read"], {
        "provider": "google", "status": "active", "email": "business@example.com",
        "access_token": "tok", "refresh_token": "r", "expires_at": 9_999_999_999,
        "scope": "https://www.googleapis.com/auth/gmail.readonly"})
    from receptionist.service import registry
    res = registry._h_gmail_send("t_a", {"to": "sam@example.com", "subject": "Re: hi", "body": "hello"})
    assert res["status"] == "failed" and "missing_scope" in res["detail"]


def test_suppressed_recipient_not_sent(_env):
    from receptionist.service import registry, stores
    from receptionist.service.schemas import OptOut
    stores.optouts().put("t_a", OptOut(tenant_id="t_a", email="sam@example.com").model_dump())
    res = registry._h_gmail_send("t_a", {"to": "sam@example.com", "subject": "Re", "body": "x"})
    assert res["status"] == "suppressed" and _env.sends == 0


def test_validate_connection_reports_capabilities(_env):
    import asyncio
    from receptionist.providers import gmail as gm
    v = asyncio.new_event_loop().run_until_complete(gm.validate_connection("t_a"))
    assert v["connected"] and v["can_send"] and v["can_read"]
