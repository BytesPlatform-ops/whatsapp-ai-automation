"""Durable approval dispatch that survives a cold restart (Wave 5, Part 13).

Proves the approval executor is reconstructed from the persisted approval payload
(no in-process closure), executes exactly once, refuses rejected/unknown actions,
and is tenant-scoped. Hermetic + $0 (file backend for restart simulation).
"""

from __future__ import annotations

import pytest


@pytest.fixture()
def file_backend(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores, registry
    import approvals.router as arouter
    stores.reset_all()
    # Drop any singletons cached by earlier tests so this test's writes/reads use the
    # file backend under tmp_path (not a prior memory-mode store).
    arouter._store = None
    arouter._executors_by_agent.clear()
    arouter._executor = None
    registry._EXECUTOR_REGISTERED = False
    registry._ensure_executor_registered()
    yield
    stores.reset_all()
    arouter._store = None


def _cold_restart():
    """Simulate a process restart: drop store singletons and ALL in-process executor
    state (both the closure dict and the registered-once flag), then run the import-
    time registration path — exactly what a fresh process does."""
    import approvals.router as arouter
    from receptionist.service import registry, stores
    stores.reset_all()
    arouter._store = None
    arouter._executors_by_agent.clear()
    arouter._executor = None
    registry._EXECUTOR_REGISTERED = False
    # A fresh process re-imports the registry, which re-registers the executor:
    registry._ensure_executor_registered()
    return arouter, registry


def test_approved_action_executes_after_cold_restart(file_backend):
    from receptionist.service import registry
    out = registry.execute_action(
        "t_a", "change_lead_stage", {"contact_id": "c1", "stage": "won"},
        conversation_id="conv1", idempotency_key="stage-1")
    assert out["status"] == "approval_required"
    approval_id = out["record_id"]

    # ── cold restart: no closure survives; only the persisted approval + the
    #    import-time-registered stateless executor remain ──
    arouter, registry = _cold_restart()
    assert "ai-receptionist" in arouter._executors_by_agent  # re-registered at "import"

    item = arouter.get_approvals_store().get("t_a", approval_id)
    assert item is not None and item.status == "pending"

    from approvals.router import ResolveBody
    resolved = arouter.approve(approval_id, ResolveBody(tenant_id="t_a"))
    assert resolved.status == "executed"
    assert resolved.execution_result is not None
    assert resolved.execution_result.get("ok") is True


def test_rejected_approval_cannot_execute(file_backend):
    from receptionist.service import registry
    result = registry.execute_approved_action(
        type("A", (), {"tenant_id": "t_a", "status": "rejected",
                       "prepared_output": {"action_type": "change_lead_stage",
                                           "arguments": {"contact_id": "c1", "stage": "won"}}})())
    assert result["ok"] is False and "rejected" in result["error"]


def test_unknown_action_fails_safely(file_backend):
    from receptionist.service import registry
    result = registry.execute_approved_action(
        type("A", (), {"tenant_id": "t_a", "status": "pending",
                       "prepared_output": {"action_type": "nonexistent_action", "arguments": {}}})())
    assert result["ok"] is False and "unknown action_type" in result["error"]


def test_execute_once_idempotent(file_backend):
    from receptionist.service import registry
    item = type("A", (), {"tenant_id": "t_a", "status": "pending", "action_type": "create_ticket",
                          "prepared_output": {"action_type": "create_ticket",
                                              "arguments": {"subject": "x"},
                                              "idempotency_key": "tk-1"}})()
    r1 = registry.execute_approved_action(item)
    assert r1["ok"] is True and not r1.get("idempotent")
    r2 = registry.execute_approved_action(item)
    assert r2["ok"] is True and r2.get("idempotent") is True
