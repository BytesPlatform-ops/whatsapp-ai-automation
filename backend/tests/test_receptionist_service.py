"""Tests for the durable AI Receptionist service (engine + console API).

Hermetic + $0: forces PIXIE_PERSIST=memory and the fake LLM provider, deletes any
provider creds so degraded paths are exercised, and resets the model-router
singleton + in-memory stores per test. Exercises the brain (all intents), the
REST surface, tenant isolation, degraded provider modes, and file-persistence
durability.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

BASE = "/api/agents/ai-receptionist"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    monkeypatch.setenv("PIXIE_AGENT_MODE", "test")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    for k in ("STRIPE_SECRET_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
              "TWILIO_PHONE_NUMBER", "EMAIL_PROVIDER_API_KEY", "AI_RECEPTIONIST_WEBHOOK_URL"):
        monkeypatch.delenv(k, raising=False)

    import models.router as mr
    mr._router = None  # rebuild with fake mode under this env

    from receptionist.service import stores
    stores.reset_all()

    import app
    return TestClient(app.app)


def _run(client, message, tenant="t_a", **kw):
    body = {"tenant_id": tenant, "message": message, **kw}
    r = client.post(f"{BASE}/message", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# ── intents ──────────────────────────────────────────────────────────────────

def test_health_and_capabilities(client):
    h = client.get(f"{BASE}/health").json()
    assert h["status"] == "ok"
    assert h["llm_provider"] == "mock"
    assert h["handlers"] == 17
    caps = client.get(f"{BASE}/capabilities").json()
    assert len(caps["intents"]) == 17
    # every intent has a registered handler
    assert set(caps["intents"]) <= set(caps["handlers"])


def test_faq_answers_from_profile(client):
    client.patch(f"{BASE}/business-profile",
                 json={"tenant_id": "t_a", "business_name": "Glow Salon", "hours": "Mon-Sat 9-7"})
    out = _run(client, "What are your business hours?")
    assert out["intent"] == "faq"
    assert "9-7" in out["reply"] or "Mon-Sat" in out["reply"]


def test_faq_no_knowledge_does_not_hallucinate(client):
    out = _run(client, "What's your refund window on custom orders?")
    # no profile configured → must defer to the team, not invent a policy
    assert out["intent"] in ("faq", "fallback")
    assert "team" in out["reply"].lower() or "?" in out["reply"]


def test_booking_creates_record(client):
    out = _run(client, "I'd like to book an appointment on 2026-08-01 at 10:00, email a@b.com")
    assert out["intent"] == "booking"
    assert out["record_type"] == "booking"
    bookings = client.get(f"{BASE}/bookings", params={"tenant_id": "t_a"}).json()["bookings"]
    assert len(bookings) == 1
    assert bookings[0]["date"] == "2026-08-01"


def test_lead_capture_scores_contact(client):
    out = _run(client, "Hi, I'm interested. Reach me at lead@b.com, budget around 3000")
    assert out["intent"] == "lead"
    leads = client.get(f"{BASE}/leads", params={"tenant_id": "t_a"}).json()["leads"]
    assert len(leads) == 1
    assert leads[0]["score"] > 0
    assert leads[0]["status"] in ("new", "follow_up_needed", "qualified")


def test_escalation_creates_ticket(client):
    out = _run(client, "I need to speak to a human, this is urgent")
    assert out["intent"] == "escalation"
    assert out["escalated"] is True
    escs = client.get(f"{BASE}/escalations", params={"tenant_id": "t_a"}).json()["escalations"]
    assert len(escs) == 1
    assert escs[0]["notified"] == []  # honest: no notifier configured


def test_quote_request(client):
    out = _run(client, "How much for a full website redesign?")
    assert out["intent"] == "quote"
    quotes = client.get(f"{BASE}/quotes", params={"tenant_id": "t_a"}).json()["quotes"]
    assert len(quotes) == 1


def test_callback_request(client):
    out = _run(client, "Please call me back at +1 415 555 0123 tomorrow")
    assert out["intent"] == "call_routing"
    cbs = client.get(f"{BASE}/callbacks", params={"tenant_id": "t_a"}).json()["callbacks"]
    assert len(cbs) == 1
    assert out["status"] == "pending"  # voice provider parks the call


def test_reminder(client):
    out = _run(client, "Remind me about my appointment on 2026-08-02")
    assert out["intent"] == "reminder"
    rems = client.get(f"{BASE}/reminders", params={"tenant_id": "t_a"}).json()["reminders"]
    assert len(rems) == 1


def test_payment_degraded_no_fake_link(client):
    out = _run(client, "Can you send me a payment link for $120?")
    assert out["intent"] == "payment_link"
    pays = client.get(f"{BASE}/payments", params={"tenant_id": "t_a"}).json()["payments"]
    assert len(pays) == 1
    assert pays[0]["status"] == "pending"       # Stripe not configured
    assert pays[0]["payment_link"] == ""         # never a fabricated link


def test_complaint_creates_ticket(client):
    out = _run(client, "This service was terrible and I want a refund")
    assert out["intent"] == "complaint"
    tks = client.get(f"{BASE}/tickets", params={"tenant_id": "t_a"}).json()["tickets"]
    assert len(tks) == 1
    assert tks[0]["kind"] == "complaint"
    assert tks[0]["priority"] == "urgent"


def test_unsubscribe_records_optout(client):
    out = _run(client, "Please unsubscribe me from all messages, email a@b.com")
    assert out["intent"] == "unsubscribe"
    opts = client.get(f"{BASE}/opt-outs", params={"tenant_id": "t_a"}).json()["opt_outs"]
    assert len(opts) == 1


def test_campaign_reply_ingest_classifies(client):
    r = client.post(f"{BASE}/campaigns/replies/ingest",
                    json={"tenant_id": "t_a", "campaign_id": "c1",
                          "message": "Yes I'm interested, tell me more!", "email": "x@y.com"})
    assert r.status_code == 200
    replies = client.get(f"{BASE}/campaigns/c1/replies", params={"tenant_id": "t_a"}).json()["replies"]
    assert len(replies) == 1
    assert replies[0]["classification"] in (
        "interested", "question", "other", "booking_request", "quote_request")


def test_general_fallback(client):
    out = _run(client, "hello there")
    assert out["intent"] == "fallback"
    assert out["reply"]


# ── integrations / degraded status ────────────────────────────────────────────

def test_integration_status_reports_missing_env(client):
    st = client.get(f"{BASE}/integrations/status", params={"tenant_id": "t_a"}).json()
    assert st["llm"]["provider"] == "mock"
    provs = {p["capability"]: p for p in st["receptionist_providers"]}
    assert provs["payment_link"]["connected"] is False
    assert "STRIPE_SECRET_KEY" in provs["payment_link"]["missing_env"]
    assert st["persistence"]["backend"] == "memory"


def test_integration_test_endpoint(client):
    r = client.post(f"{BASE}/integrations/test", json={"tenant_id": "t_a", "capability": "payment_link"})
    assert r.status_code == 200
    assert r.json()["capability"] == "payment_link"


# ── tenant isolation ──────────────────────────────────────────────────────────

def test_tenant_isolation(client):
    _run(client, "Book me for 2026-08-01 at 09:00, email a@b.com", tenant="t_a")
    a = client.get(f"{BASE}/bookings", params={"tenant_id": "t_a"}).json()["bookings"]
    b = client.get(f"{BASE}/bookings", params={"tenant_id": "t_b"}).json()["bookings"]
    assert len(a) == 1
    assert len(b) == 0


# ── conversations continuity ──────────────────────────────────────────────────

def test_conversation_continuity(client):
    first = _run(client, "Hi", tenant="t_a")
    conv_id = first["conversation_id"]
    r = client.post(f"{BASE}/conversations/{conv_id}/messages",
                    json={"tenant_id": "t_a", "message": "I want to book an appointment 2026-08-05 at 11:00"})
    assert r.status_code == 200
    assert r.json()["conversation_id"] == conv_id
    detail = client.get(f"{BASE}/conversations/{conv_id}", params={"tenant_id": "t_a"}).json()
    assert len(detail["messages"]) >= 4  # 2 turns × (customer + assistant)


# ── knowledge base + business profile ─────────────────────────────────────────

def test_knowledge_crud_and_faq(client):
    created = client.post(f"{BASE}/knowledge", json={
        "tenant_id": "t_a", "title": "Parking", "content": "Free parking is available behind the building."
    }).json()["item"]
    assert created["id"]
    out = _run(client, "Is there parking available?")
    assert "parking" in out["reply"].lower()
    # update + delete
    client.patch(f"{BASE}/knowledge/{created['id']}", json={"tenant_id": "t_a", "content": "No parking on Sundays."})
    d = client.delete(f"{BASE}/knowledge/{created['id']}", params={"tenant_id": "t_a"}).json()
    assert d["deleted"] is True


def test_overview_analytics(client):
    _run(client, "Book me 2026-08-01 at 10:00, email a@b.com")
    _run(client, "How much for a logo?")
    ov = client.get(f"{BASE}/overview", params={"tenant_id": "t_a"}).json()
    assert ov["totals"]["conversations"] >= 2
    assert ov["totals"]["bookings_requested"] >= 1
    assert ov["totals"]["quotes"] >= 1
    assert "intent_distribution" in ov


# ── existing agent slice still works (no regression) ──────────────────────────

def test_existing_run_slice_intact(client):
    # The older approval slice at POST /run is still mounted and reachable (not
    # clobbered by the console router). In fake mode its model returns non-JSON,
    # so the endpoint's honest error path is 502 — what matters is it's handled,
    # not a 404 (route lost) or an unhandled 500.
    r = client.post(f"{BASE}/run", json={
        "tenant_id": "t_a", "body": "Hi, can you tell me your pricing?", "from_email": "c@d.com"})
    assert r.status_code in (200, 400, 502)
    if r.status_code == 200:
        assert r.json()["status"] == "approval_required"


# ── durability (file backend round-trip) ──────────────────────────────────────

def test_file_persistence_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    from receptionist.service import stores
    from receptionist.service.schemas import Booking

    stores.reset_all()
    bk = Booking(tenant_id="t_file", service_type="haircut", date="2026-09-01").model_dump()
    stores.bookings().put("t_file", bk)

    stores.reset_all()  # simulate a fresh process — re-reads the JSON on disk
    again = stores.bookings().list("t_file")
    assert len(again) == 1
    assert again[0]["service_type"] == "haircut"
