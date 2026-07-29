"""Multi-turn memory, idempotency, history bounding, and file-persistence tests
for the durable AI Receptionist.

All tests are hermetic (PIXIE_PERSIST=memory by default, fake LLM, $0 cost).
The file-persistence round-trip uses a tmp_path fixture and PIXIE_PERSIST=file.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

BASE = "/api/agents/ai-receptionist"


# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    monkeypatch.setenv("PIXIE_AGENT_MODE", "test")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.setenv("AI_RECEPTIONIST_HISTORY_MESSAGE_LIMIT", "10")
    for k in ("STRIPE_SECRET_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
              "TWILIO_PHONE_NUMBER", "EMAIL_PROVIDER_API_KEY", "AI_RECEPTIONIST_WEBHOOK_URL"):
        monkeypatch.delenv(k, raising=False)

    import models.router as mr
    mr._router = None

    from receptionist.service import stores
    stores.reset_all()

    import app
    return TestClient(app.app)


def _run(client, message, tenant="t_mt", **kw):
    body = {"tenant_id": tenant, "message": message, **kw}
    r = client.post(f"{BASE}/message", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# ── test 1: contact memory across turns ───────────────────────────────────────

def test_contact_memory_across_turns(client):
    """Turn 1 provides identity; Turn 2 on same conversation books without repeating
    identity — the booking should resolve the name from the linked contact."""
    # Turn 1: provide name + email (enough to create a contact)
    r1 = _run(client, "my name is Ahmed, email ahmed@x.com")
    conv_id = r1["conversation_id"]
    contact_id = r1.get("contact_id")

    # The contact should have been created with name=Ahmed
    assert contact_id is not None, "A contact must be resolved from the first message"
    leads = client.get(f"{BASE}/leads", params={"tenant_id": "t_mt"}).json()["leads"]
    ahmed = next((l for l in leads if l.get("email") == "ahmed@x.com"), None)
    assert ahmed is not None, "Ahmed's contact must exist"
    assert ahmed.get("name") == "Ahmed"

    # Turn 2: book an appointment on the same conversation without giving name again
    r2 = _run(client, "book an appointment for friday 3pm",
              conversation_id=conv_id)
    assert r2["conversation_id"] == conv_id

    # The booking should link back to Ahmed's contact
    bookings = client.get(f"{BASE}/bookings", params={"tenant_id": "t_mt"}).json()["bookings"]
    assert len(bookings) == 1, "Exactly one booking must exist"
    bk = bookings[0]
    # The booking contact_id or name must resolve Ahmed (via contact memory)
    assert (bk.get("contact_id") == contact_id or
            bk.get("name") == "Ahmed" or
            bk.get("email") == "ahmed@x.com"), (
        f"Booking must link to Ahmed's contact; got: {bk}"
    )


# ── test 2: idempotency key prevents duplicate records ────────────────────────

def test_idempotency_key_prevents_duplicate(client):
    """Posting the same message twice with the same idempotency_key must return
    the cached result and must NOT create a second message or booking record."""
    body = {
        "tenant_id": "t_idem",
        "message": "Book me on 2026-09-10 at 14:00, email idem@test.com",
        "idempotency_key": "unique-msg-abc-123",
    }

    # First call
    r1 = client.post(f"{BASE}/message", json=body)
    assert r1.status_code == 200, r1.text
    data1 = r1.json()

    # Count messages after first call
    conv_id = data1["conversation_id"]
    detail1 = client.get(f"{BASE}/conversations/{conv_id}",
                         params={"tenant_id": "t_idem"}).json()
    msg_count_after_first = len(detail1["messages"])

    # Second call with same idempotency_key
    r2 = client.post(f"{BASE}/message", json=body)
    assert r2.status_code == 200, r2.text
    data2 = r2.json()

    # Result must be identical
    assert data2["conversation_id"] == data1["conversation_id"], (
        "Duplicate idempotency_key must return the same conversation_id"
    )
    assert data2["intent"] == data1["intent"]
    assert data2["reply"] == data1["reply"]

    # Message count must be unchanged (no new messages persisted)
    detail2 = client.get(f"{BASE}/conversations/{conv_id}",
                         params={"tenant_id": "t_idem"}).json()
    msg_count_after_second = len(detail2["messages"])
    assert msg_count_after_second == msg_count_after_first, (
        f"Duplicate idempotency key must not create more messages: "
        f"{msg_count_after_first} → {msg_count_after_second}"
    )

    # Booking count must be unchanged
    bookings = client.get(f"{BASE}/bookings", params={"tenant_id": "t_idem"}).json()["bookings"]
    assert len(bookings) == 1, (
        f"Idempotent replay must not create a second booking; found {len(bookings)}"
    )


def test_provider_message_id_dedup(client):
    """provider_message_id works as a dedup key just like idempotency_key."""
    body = {
        "tenant_id": "t_pmid",
        "message": "I want a quote for a logo design",
        "provider_message_id": "msg-id-xyz-999",
    }
    r1 = client.post(f"{BASE}/message", json=body)
    assert r1.status_code == 200
    quotes1 = client.get(f"{BASE}/quotes", params={"tenant_id": "t_pmid"}).json()["quotes"]
    assert len(quotes1) == 1

    # Replay
    r2 = client.post(f"{BASE}/message", json=body)
    assert r2.status_code == 200
    assert r2.json()["intent"] == r1.json()["intent"]
    quotes2 = client.get(f"{BASE}/quotes", params={"tenant_id": "t_pmid"}).json()["quotes"]
    assert len(quotes2) == 1, "Replayed provider_message_id must not create a second quote"


def test_no_dedup_key_behaves_normally(client):
    """Without a dedup key, the same message sent twice creates two records."""
    body = {
        "tenant_id": "t_nodedup",
        "message": "Book me on 2026-09-11 at 15:00, email nodedup@test.com",
    }
    client.post(f"{BASE}/message", json=body)
    client.post(f"{BASE}/message", json=body)
    bookings = client.get(f"{BASE}/bookings", params={"tenant_id": "t_nodedup"}).json()["bookings"]
    # Without dedup, two bookings are expected
    assert len(bookings) == 2


# ── test 3: history is bounded to the configured limit ────────────────────────

def test_history_bounded_to_limit(monkeypatch):
    """AI_RECEPTIONIST_HISTORY_MESSAGE_LIMIT caps the history passed to classify."""
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    monkeypatch.setenv("PIXIE_AGENT_MODE", "test")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.setenv("AI_RECEPTIONIST_HISTORY_MESSAGE_LIMIT", "4")

    import models.router as mr
    mr._router = None

    from receptionist.service import stores
    stores.reset_all()

    import app
    from fastapi.testclient import TestClient
    c = TestClient(app.app)

    tenant = "t_hist"
    # Send 6 messages on the same conversation
    first = c.post(f"{BASE}/message",
                   json={"tenant_id": tenant, "message": "msg 1"}).json()
    conv_id = first["conversation_id"]
    for i in range(2, 7):
        c.post(f"{BASE}/message",
               json={"tenant_id": tenant, "message": f"msg {i}",
                     "conversation_id": conv_id})

    # Total messages in store: 6 turns × 2 (customer + assistant) = 12
    detail = c.get(f"{BASE}/conversations/{conv_id}",
                   params={"tenant_id": tenant}).json()
    total_msgs = len(detail["messages"])
    assert total_msgs == 12, f"Expected 12 messages, got {total_msgs}"

    # build_context must return at most 4 (the configured limit)
    from receptionist.service.engine import build_context
    conv = stores.conversations().get(tenant, conv_id)
    ctx = build_context(tenant, conv, None)
    assert len(ctx["history"]) <= 4, (
        f"History must be bounded to 4; got {len(ctx['history'])}"
    )


# ── test 4: file-persistence round-trip ───────────────────────────────────────

def test_file_persistence_summary_and_messages_survive_reset(tmp_path, monkeypatch):
    """summary + messages survive a stores.reset_all() with PIXIE_PERSIST=file."""
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    monkeypatch.setenv("PIXIE_AGENT_MODE", "test")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")

    import models.router as mr
    mr._router = None

    from receptionist.service import stores
    stores.reset_all()

    import app
    from fastapi.testclient import TestClient
    c = TestClient(app.app)

    tenant = "t_file_mt"

    # Send a message to create a conversation with a summary
    r = c.post(f"{BASE}/message",
               json={"tenant_id": tenant,
                     "message": "I want to book a haircut on 2026-10-01 at 11:00, email file@test.com"})
    assert r.status_code == 200
    conv_id = r.json()["conversation_id"]

    # Read the summary and message count before reset
    conv_before = stores.conversations().get(tenant, conv_id)
    assert conv_before is not None
    summary_before = conv_before.get("summary", "")
    msg_count_before = stores.messages().count(tenant)
    assert msg_count_before >= 2  # customer + assistant

    # Simulate a fresh process
    stores.reset_all()

    # Re-read — data must survive from disk
    conv_after = stores.conversations().get(tenant, conv_id)
    assert conv_after is not None, "Conversation must survive stores.reset_all() in file mode"
    assert conv_after.get("summary") == summary_before, (
        "Summary must be identical after reset (loaded from disk)"
    )
    msg_count_after = stores.messages().count(tenant)
    assert msg_count_after == msg_count_before, (
        f"Message count must survive reset: {msg_count_before} → {msg_count_after}"
    )

    # summary_version must be at least 1 (incremented each turn)
    assert int(conv_after.get("summary_version", 0)) >= 1
