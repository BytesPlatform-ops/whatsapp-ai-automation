"""Durable, idempotent, period-scoped Receptionist usage counters (Wave 5, Part 15)."""

from __future__ import annotations

import pytest


@pytest.fixture()
def file_backend(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    from receptionist.service import stores
    stores.reset_all()
    yield stores
    stores.reset_all()


@pytest.fixture(autouse=True)
def _mem(monkeypatch):
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")


def test_increment_and_get():
    from receptionist.service import stores, usage
    stores.reset_all()
    assert usage.get("t_a", "monthly_ai_turns") == 0
    assert usage.increment("t_a", "monthly_ai_turns") == 1
    assert usage.increment("t_a", "monthly_ai_turns", amount=2) == 3
    assert usage.get("t_a", "monthly_ai_turns") == 3


def test_idempotent_increment_does_not_double_count():
    from receptionist.service import stores, usage
    stores.reset_all()
    assert usage.increment("t_a", "monthly_conversations", idempotency_key="c1") == 1
    assert usage.increment("t_a", "monthly_conversations", idempotency_key="c1") == 1
    assert usage.increment("t_a", "monthly_conversations", idempotency_key="c2") == 2


def test_counters_are_tenant_scoped():
    from receptionist.service import stores, usage
    stores.reset_all()
    usage.increment("t_a", "escalations")
    assert usage.get("t_a", "escalations") == 1
    assert usage.get("t_b", "escalations") == 0


def test_counters_survive_restart(file_backend):
    from receptionist.service import usage
    usage.increment("t_a", "reminders", idempotency_key="r1")
    file_backend.reset_all()  # simulate process restart
    assert usage.get("t_a", "reminders") == 1
    # replaying the same idempotency key after restart still does not double count
    assert usage.increment("t_a", "reminders", idempotency_key="r1") == 1


def test_engine_increments_conversation_and_turn_counters():
    from receptionist.service import engine, stores, usage
    stores.reset_all()
    out = engine.run_message(tenant_id="t_a", message="hi there")
    conv_id = out["conversation_id"]
    assert usage.get("t_a", "monthly_conversations") == 1
    assert usage.get("t_a", "monthly_ai_turns") == 1
    # second turn on same conversation: +1 turn, still 1 conversation
    engine.run_message(tenant_id="t_a", message="what are your hours?", conversation_id=conv_id)
    assert usage.get("t_a", "monthly_conversations") == 1
    assert usage.get("t_a", "monthly_ai_turns") == 2


def test_summary_shape():
    from receptionist.service import stores, usage
    stores.reset_all()
    usage.increment("t_a", "monthly_ai_turns")
    s = usage.summary("t_a")
    assert s["counters"]["monthly_ai_turns"] == 1
    assert "stored_contacts" in s["gauges"]
    assert "start" in s["period"]
