"""Entitlements tests — trial/active gating, idempotency, demo seed. $0, no net."""

from __future__ import annotations

import pytest

import entitlements.router as er
from entitlements.router import (
    AgentEntitlement, AgentState, StartTrialBody, CheckoutBody, _Store,
    start_trial, get_entitlement, create_checkout,
)
from fastapi import HTTPException


def _fresh():
    """Replace the module singleton with a clean store (no demo seed)."""
    er._store = _Store()
    return er._store


def test_fresh_tenant_all_locked():
    _fresh()
    ent = get_entitlement("seo", tenant_id="t_new")
    assert ent.state == AgentState.locked.value


def test_start_trial_flips_to_trial():
    _fresh()
    ent = start_trial(StartTrialBody(tenant_id="t1", agent="marketing", now="2026-06-30T00:00:00Z", ends="2026-07-07T00:00:00Z"))
    assert ent.state == AgentState.trial.value
    assert ent.trial_ends_at == "2026-07-07T00:00:00Z"


def test_start_trial_is_idempotent_while_active():
    _fresh()
    start_trial(StartTrialBody(tenant_id="t2", agent="seo"))
    again = start_trial(StartTrialBody(tenant_id="t2", agent="seo"))
    assert again.state == AgentState.trial.value  # no error, still usable


def test_second_trial_after_reset_is_blocked():
    store = _fresh()
    start_trial(StartTrialBody(tenant_id="t3", agent="content"))
    # simulate trial ended → relock, but trial already 'used'
    store.set("t3", AgentEntitlement(agent="content", state=AgentState.locked))
    with pytest.raises(HTTPException) as exc:
        start_trial(StartTrialBody(tenant_id="t3", agent="content"))
    assert exc.value.status_code == 409


def test_unknown_agent_404():
    _fresh()
    with pytest.raises(HTTPException) as exc:
        start_trial(StartTrialBody(tenant_id="t4", agent="nope"))
    assert exc.value.status_code == 404


def test_checkout_is_stub_and_never_activates():
    _fresh()
    out = create_checkout(CheckoutBody(tenant_id="t5", agent="website"))
    assert out["stub"] is True and out["checkout_url"] is None
    # checkout must NOT have flipped the agent to active (no silent charge/unlock)
    assert get_entitlement("website", tenant_id="t5").state == AgentState.locked.value


def test_demo_seed_has_active_and_trial():
    er._store = None  # force re-create with the demo seed
    states = {e.agent: e.state for e in er._get_store().all("demo")}
    assert states["website"] == AgentState.active.value
    assert states["receptionist"] == AgentState.trial.value
    assert states["seo"] == AgentState.locked.value


if __name__ == "__main__":
    import traceback
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn(); print("ok", name)
            except Exception:
                traceback.print_exc(); print("FAIL", name)
