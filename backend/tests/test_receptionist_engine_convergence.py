"""Canonical engine / executor convergence (Wave 5, Parts 1/2).

Proves there is exactly ONE approval executor registered for the "ai-receptionist"
agent (the canonical registry dispatcher), that importing the legacy agent module
does not clobber it, and that a legacy connector-style approval payload is routed
THROUGH the canonical dispatcher (never a second, competing executor).
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _mem(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores
    stores.reset_all()
    yield
    stores.reset_all()


def test_single_canonical_executor_owns_the_slot():
    import approvals.router as arouter
    # Importing both the legacy agent and the canonical registry must leave exactly
    # ONE executor registered for the receptionist — the canonical one.
    from receptionist import agent  # noqa: F401 — must NOT register a competing executor
    from receptionist.service import registry
    registry._ensure_executor_registered()
    assert arouter._executors_by_agent.get("ai-receptionist") is registry.execute_approved_action


def test_legacy_payload_routes_through_canonical_dispatcher():
    from receptionist.service import registry
    # A legacy /run approval payload carries connector execution_actions (no action_type).
    legacy_item = type("A", (), {
        "tenant_id": "t_a", "status": "pending", "action_type": "email_send",
        "prepared_output": {"execution_actions": [
            {"capability": "email_send", "payload": {"to": "x@y.com", "subject": "Hi", "body": "Hello"}}]},
    })()
    result = registry.execute_approved_action(legacy_item)
    # Delegated to the legacy connector executor (mock mode → nothing left the box).
    assert "results" in result and result.get("executed") is False


def test_canonical_message_endpoint_is_the_writable_engine():
    # The canonical writable engine mutates state durably through service.engine.
    from receptionist.service import engine, stores
    stores.reset_all()
    out = engine.run_message(tenant_id="t_a", message="hello", channel="web_chat")
    assert out["conversation_id"]
    # the turn persisted a conversation + messages via the canonical stores
    assert stores.conversations().count("t_a") == 1
    assert stores.messages().count("t_a") >= 2


def test_legacy_chat_route_folds_into_canonical_engine(monkeypatch):
    """POST /receptionist/chat must reach the canonical engine (durable conversation)
    and no longer run an independent prompt/parser/side-effect path."""
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores
    stores.reset_all()
    import app
    from fastapi.testclient import TestClient
    client = TestClient(app.app)

    r = client.post("/receptionist/chat", json={"tenant_id": "t_chat", "message": "what are your hours?"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "reply_text" in body and "action" in body and "usage" in body
    assert body["conversation_id"]
    assert stores.conversations().count("t_chat") == 1
    assert stores.messages().count("t_chat") >= 2


def test_no_independent_writable_engine_imports_in_chat_route():
    """The chat route module must not run the legacy engine/action executor."""
    import inspect
    from receptionist import api
    src = inspect.getsource(api)
    # no import of the legacy engine / action dispatcher, and no call to run_action(
    assert "from .core import" not in src
    assert "from .actions import" not in src
    assert "run_action(" not in src
    assert "ReceptionEngine(" not in src
