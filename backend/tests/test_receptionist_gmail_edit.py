"""Inline Gmail draft editing + approval invalidation (Wave 11). Hermetic."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores
    import approvals.router as ar
    stores.reset_all()
    ar._store = None
    ar._executors_by_agent.clear()
    ar._executor = None
    yield
    stores.reset_all()


def test_edit_updates_subject_and_body():
    from receptionist.service import gmail_sync
    d = gmail_sync.save_draft("t_a", {"to": "a@x.com", "subject": "Re: old", "body": "old", "status": "generated"})
    out = gmail_sync.edit_draft("t_a", d["id"], subject="Re: new", body="new body")
    assert out["subject"] == "Re: new" and out["body"] == "new body"
    assert out["edit_history"] and out["edit_history"][0]["body"] == "old"


def test_edit_pending_approval_invalidates_it():
    from receptionist.service import gmail_sync
    from approvals.router import get_approvals_store, ApprovalItem
    item = get_approvals_store().create(ApprovalItem(
        id="", tenant_id="t_a", agent="ai-receptionist", title="send", action_type="gmail_send"))
    d = gmail_sync.save_draft("t_a", {"to": "a@x.com", "subject": "Re", "body": "b",
                                      "status": "pending_approval", "approval_id": item.id})
    out = gmail_sync.edit_draft("t_a", d["id"], body="edited")
    assert out["approval_invalidated"] is True
    assert out["status"] == "generated" and out["approval_id"] == ""
    # the old approval can no longer execute
    assert get_approvals_store().get("t_a", item.id).status == "skipped"


def test_sent_draft_cannot_be_edited():
    from receptionist.service import gmail_sync
    d = gmail_sync.save_draft("t_a", {"to": "a@x.com", "status": "sent", "provider_message_id": "m1"})
    out = gmail_sync.edit_draft("t_a", d["id"], body="x")
    assert out["status"] == "locked"


def test_edit_missing_draft():
    from receptionist.service import gmail_sync
    assert gmail_sync.edit_draft("t_a", "nope", body="x") is None
