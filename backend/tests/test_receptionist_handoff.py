"""Human handoff state machine tests for the durable AI Receptionist.

All tests are hermetic (PIXIE_PERSIST=memory, fake LLM, $0 cost).
"""

from __future__ import annotations

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
    monkeypatch.setenv("AI_RECEPTIONIST_SLA_MINUTES", "30")
    for k in ("STRIPE_SECRET_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
              "TWILIO_PHONE_NUMBER", "EMAIL_PROVIDER_API_KEY", "AI_RECEPTIONIST_WEBHOOK_URL"):
        monkeypatch.delenv(k, raising=False)

    import models.router as mr
    mr._router = None

    from receptionist.service import stores
    stores.reset_all()

    import app
    return TestClient(app.app)


def _run(client, message, tenant="t_ho", **kw):
    body = {"tenant_id": tenant, "message": message, **kw}
    r = client.post(f"{BASE}/message", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _get_conv(client, conv_id, tenant="t_ho"):
    r = client.get(f"{BASE}/conversations/{conv_id}", params={"tenant_id": tenant})
    assert r.status_code == 200
    return r.json()["conversation"]


# ── test 1: escalate → ai_paused; next /message returns ai_paused ─────────────

def test_escalate_sets_waiting_for_human_and_pauses_ai(client):
    """Escalating a conversation must set status=waiting_for_human, ai_paused=True,
    and sla_due_at; a following /message must not get an AI reply."""
    # Create a conversation
    r = _run(client, "Hi, I need help")
    conv_id = r["conversation_id"]

    # Escalate via the console endpoint
    esc_r = client.post(
        f"{BASE}/conversations/{conv_id}/escalate",
        json={"tenant_id": "t_ho", "reason": "Customer angry"},
    )
    assert esc_r.status_code == 200, esc_r.text
    esc_data = esc_r.json()
    assert esc_data["conversation_status"] == "waiting_for_human"
    assert esc_data["ai_paused"] is True
    assert esc_data.get("sla_due_at", "") != ""

    # Conversation record must reflect the new state
    conv = _get_conv(client, conv_id)
    assert conv["status"] == "waiting_for_human"
    assert conv.get("ai_paused") is True
    assert conv.get("sla_due_at", "") != ""

    # A following customer message must NOT trigger an AI reply
    msg_count_before = len(_get_conv(client, conv_id)["messages"] if False else
                           client.get(f"{BASE}/conversations/{conv_id}",
                                      params={"tenant_id": "t_ho"}).json()["messages"])

    r2 = client.post(f"{BASE}/message",
                     json={"tenant_id": "t_ho", "message": "Hello?",
                           "conversation_id": conv_id})
    assert r2.status_code == 200, r2.text
    data2 = r2.json()

    assert data2.get("ai_paused") is True
    assert data2.get("reply", "") == "", (
        f"AI must not reply while ai_paused; got: {data2.get('reply')}"
    )
    assert data2.get("status") in {"waiting_for_human", "assigned_to_human",
                                   "human_active", "resolved"}

    # Exactly one new message must have been persisted (customer only, no assistant)
    detail = client.get(f"{BASE}/conversations/{conv_id}",
                        params={"tenant_id": "t_ho"}).json()
    msg_count_after = len(detail["messages"])
    assert msg_count_after == msg_count_before + 1, (
        f"Only the customer message must be persisted while ai_paused "
        f"(expected +1, got: {msg_count_before} → {msg_count_after})"
    )
    # The newly persisted message must not be a role=assistant
    new_msg = detail["messages"][-1]
    assert new_msg.get("role") in {"customer"}, (
        f"New message while paused must be role=customer; got: {new_msg.get('role')}"
    )


def test_escalation_via_intent_handler_sets_waiting_for_human(client):
    """The AI escalation handler (speak to a human) must also set waiting_for_human."""
    r = _run(client, "I need to speak to a human agent please")
    conv_id = r["conversation_id"]
    assert r["intent"] == "escalation"
    assert r.get("escalated") is True

    conv = _get_conv(client, conv_id)
    assert conv["status"] == "waiting_for_human", (
        f"AI escalation handler must set waiting_for_human; got: {conv['status']}"
    )
    assert conv.get("ai_paused") is True
    assert conv.get("sla_due_at", "") != ""
    audit = conv.get("audit", [])
    assert len(audit) >= 1
    assert audit[-1]["to"] == "waiting_for_human"


# ── test 2: full handoff flow: assign → accept → human-reply → resolve → resume ─

def test_full_handoff_state_machine(client):
    """Complete handoff: escalate → assign → accept → human-reply → resolve → resume-ai.

    Verify each transition, audit growth, and that AI is active again after resume.
    """
    tenant = "t_fsm"

    # 1. Create a conversation
    r = client.post(f"{BASE}/message",
                    json={"tenant_id": tenant, "message": "Hi I need help"})
    assert r.status_code == 200
    conv_id = r.json()["conversation_id"]

    def conv():
        rr = client.get(f"{BASE}/conversations/{conv_id}", params={"tenant_id": tenant})
        return rr.json()["conversation"]

    initial_audit_len = len(conv().get("audit", []))

    # 2. Escalate
    esc_r = client.post(f"{BASE}/conversations/{conv_id}/escalate",
                        json={"tenant_id": tenant, "reason": "needs human"})
    assert esc_r.status_code == 200
    assert conv()["status"] == "waiting_for_human"
    assert len(conv().get("audit", [])) > initial_audit_len

    # 3. Assign
    assign_r = client.post(f"{BASE}/conversations/{conv_id}/assign",
                           json={"tenant_id": tenant, "assignee": "agent_alice"})
    assert assign_r.status_code == 200
    c = conv()
    assert c["status"] == "assigned_to_human"
    assert c.get("assigned_to") == "agent_alice"
    audit_after_assign = len(c.get("audit", []))

    # 4. Accept
    accept_r = client.post(f"{BASE}/conversations/{conv_id}/accept",
                           json={"tenant_id": tenant, "assignee": "agent_alice"})
    assert accept_r.status_code == 200
    c = conv()
    assert c["status"] == "human_active"
    audit_after_accept = len(c.get("audit", []))
    assert audit_after_accept > audit_after_assign

    # 5. Human reply — must persist role=human message, not run AI
    hr = client.post(f"{BASE}/conversations/{conv_id}/human-reply",
                     json={"tenant_id": tenant, "message": "Hi, this is Alice. How can I help?",
                           "author": "agent_alice"})
    assert hr.status_code == 200
    hr_data = hr.json()
    assert hr_data["message"]["role"] == "human"
    assert hr_data["conversation_status"] == "human_active"

    detail = client.get(f"{BASE}/conversations/{conv_id}",
                        params={"tenant_id": tenant}).json()
    human_msgs = [m for m in detail["messages"] if m["role"] == "human"]
    assert len(human_msgs) >= 1

    # 6. Resolve
    resolve_r = client.post(f"{BASE}/conversations/{conv_id}/resolve",
                             json={"tenant_id": tenant})
    assert resolve_r.status_code == 200
    c = conv()
    assert c["status"] == "resolved"
    audit_after_resolve = len(c.get("audit", []))

    # 7. Resume AI
    resume_r = client.post(f"{BASE}/conversations/{conv_id}/resume-ai",
                           json={"tenant_id": tenant})
    assert resume_r.status_code == 200
    c = conv()
    assert c["status"] == "ai_active"
    assert c.get("ai_paused") is False
    audit_after_resume = len(c.get("audit", []))
    assert audit_after_resume > audit_after_resolve

    # Audit entries must record escalate→assign→accept→resolve→resume transitions
    audit = c.get("audit", [])
    statuses_seen = [entry["to"] for entry in audit]
    assert "waiting_for_human" in statuses_seen
    assert "assigned_to_human" in statuses_seen
    assert "human_active" in statuses_seen
    assert "resolved" in statuses_seen
    assert "ai_active" in statuses_seen


# ── test 3: AI responds after resume-ai ───────────────────────────────────────

def test_ai_responds_after_resume(client):
    """After resume-ai, a new /message IS answered by the AI."""
    tenant = "t_rsm"

    # Create + escalate + resume
    r = client.post(f"{BASE}/message",
                    json={"tenant_id": tenant, "message": "Hi"})
    conv_id = r.json()["conversation_id"]

    client.post(f"{BASE}/conversations/{conv_id}/escalate",
                json={"tenant_id": tenant, "reason": "test"})

    # Confirm paused
    r_paused = client.post(f"{BASE}/message",
                           json={"tenant_id": tenant, "message": "Anyone there?",
                                 "conversation_id": conv_id})
    assert r_paused.json().get("ai_paused") is True
    assert r_paused.json().get("reply", "") == ""

    # Resume AI
    client.post(f"{BASE}/conversations/{conv_id}/resume-ai",
                json={"tenant_id": tenant})

    # Send a new message — AI must reply
    r_ai = client.post(f"{BASE}/message",
                       json={"tenant_id": tenant,
                             "message": "Book me on 2026-11-01 at 10:00, email resume@test.com",
                             "conversation_id": conv_id})
    assert r_ai.status_code == 200
    data = r_ai.json()
    assert data.get("ai_paused") is not True, (
        "After resume-ai, messages must be processed by the AI"
    )
    assert data.get("reply", "") != "", "AI must generate a reply after resume"
    assert "conversation_id" in data


# ── test 4: cross-tenant assign/accept/resume → 404 ──────────────────────────

def test_cross_tenant_handoff_returns_404(client):
    """Handoff endpoints must return 404 when the conversation belongs to a different tenant."""
    # Create a conversation under tenantA
    r = client.post(f"{BASE}/message",
                    json={"tenant_id": "t_ct_a", "message": "Hi"})
    assert r.status_code == 200
    conv_id = r.json()["conversation_id"]

    # Escalate under tenantA to put it in waiting_for_human
    client.post(f"{BASE}/conversations/{conv_id}/escalate",
                json={"tenant_id": "t_ct_a", "reason": "test"})

    # tenantB tries to assign — must be 404
    r_assign = client.post(
        f"{BASE}/conversations/{conv_id}/assign",
        json={"tenant_id": "t_ct_b", "assignee": "hacker"},
        params={"tenant_id": "t_ct_b"},
    )
    assert r_assign.status_code == 404, (
        f"Cross-tenant assign must be 404; got {r_assign.status_code}: {r_assign.text}"
    )

    # tenantB tries to accept — must be 404
    r_accept = client.post(
        f"{BASE}/conversations/{conv_id}/accept",
        json={"tenant_id": "t_ct_b", "assignee": "hacker"},
        params={"tenant_id": "t_ct_b"},
    )
    assert r_accept.status_code == 404

    # tenantB tries to resume-ai — must be 404
    r_resume = client.post(
        f"{BASE}/conversations/{conv_id}/resume-ai",
        json={"tenant_id": "t_ct_b"},
        params={"tenant_id": "t_ct_b"},
    )
    assert r_resume.status_code == 404


def test_cross_tenant_human_reply_returns_404(client):
    """human-reply from a different tenant must be 404."""
    r = client.post(f"{BASE}/message",
                    json={"tenant_id": "t_ct2_a", "message": "Hello"})
    conv_id = r.json()["conversation_id"]

    r_hr = client.post(
        f"{BASE}/conversations/{conv_id}/human-reply",
        json={"tenant_id": "t_ct2_b", "message": "Sneaky reply"},
        params={"tenant_id": "t_ct2_b"},
    )
    assert r_hr.status_code == 404


def test_cross_tenant_resolve_returns_404(client):
    """resolve from a different tenant must be 404."""
    r = client.post(f"{BASE}/message",
                    json={"tenant_id": "t_ct3_a", "message": "Hello"})
    conv_id = r.json()["conversation_id"]

    r_res = client.post(
        f"{BASE}/conversations/{conv_id}/resolve",
        json={"tenant_id": "t_ct3_b"},
        params={"tenant_id": "t_ct3_b"},
    )
    assert r_res.status_code == 404
