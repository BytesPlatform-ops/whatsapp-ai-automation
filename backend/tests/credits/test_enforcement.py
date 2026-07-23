"""Product enforcement wrapper + estimate service — reserve/settle/release around
a real operation, no-op when disabled or mock."""

from __future__ import annotations

import pytest

from credits import config, enforcement, estimate, ledger, reservations, service, wallet
from credits.reservations import ReservationStatus, get_reservation_repository


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for k in ["CREDIT_SYSTEM_ENABLED", "BILLING_ENFORCEMENT_ENABLED", "MOCK_USAGE_CONSUMES_CREDITS",
              "ALLOW_NEGATIVE_CREDITS", "PIXIE_PERSIST"]:
        monkeypatch.delenv(k, raising=False)
    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        r()
    yield
    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        r()


def _fund(tenant="ws_A", amount=100000):
    service.grant(tenant, amount, reason_code="seed", idempotency_key=f"seed:{tenant}")


def _est(tenant="ws_A", variations=1, is_mock=False):
    return estimate.content_agent_estimate(tenant, variations=variations, is_mock=is_mock)


# ── estimate ────────────────────────────────────────────────────────────────────
def test_mock_estimate_is_zero_by_default():
    e = _est(is_mock=True)
    assert e["estimated_credits_mc"] == 0 and e["max_reservation_mc"] == 0 and e["mock"] is True


def test_real_estimate_scales_with_variations():
    one = _est(variations=1)["max_reservation_mc"]
    three = _est(variations=3)["max_reservation_mc"]
    assert three == 3 * one and one > 0


def test_estimate_reports_sufficiency(monkeypatch):
    _fund(amount=100)  # tiny balance
    e = _est(variations=1)
    assert e["available_mc"] == 100 and e["sufficient"] is False


# ── enforce: disabled → no-op ───────────────────────────────────────────────────
def test_disabled_system_is_passthrough_no_hold(monkeypatch):
    _fund()
    with enforcement.enforce("ws_A", operation_type="content_text", source_product="content_agent",
                             source_object_id="d1", operation_id="op1", estimate=_est(),
                             feature="content_agent", limit_key="monthly_text_generations", used=0,
                             is_mock=False) as op:
        assert op.required is False
        op.provider_succeeded(5000)
    assert wallet.balances("ws_A") == (100000, 0)  # untouched


# ── enforce: mock consumes zero ─────────────────────────────────────────────────
def test_mock_consumes_zero_even_when_enabled(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    _fund()
    with enforcement.enforce("ws_A", operation_type="content_text", source_product="content_agent",
                             source_object_id="d1", operation_id="op1", estimate=_est(is_mock=True),
                             is_mock=True) as op:
        assert op.required is False
        op.provider_succeeded(0)
    assert wallet.balances("ws_A") == (100000, 0)


# ── enforce: real success settles once, releases unused ─────────────────────────
def test_real_success_settles_actual_and_releases_unused(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    _fund()
    est = _est(variations=1)  # max reservation from $0.02 ceiling
    with enforcement.enforce("ws_A", operation_type="content_text", source_product="content_agent",
                             source_object_id="d1", operation_id="op1", estimate=est,
                             is_mock=False) as op:
        # actual provider cost only $0.005 = 5000 µUSD
        op.provider_succeeded(5000)
    avail, reserved = wallet.balances("ws_A")
    assert reserved == 0 and op.billing_state == "settled"
    # charged only the actual (5000 µUSD → 5000*1.3/10000 = 0.65 → 650 mc)
    assert avail == 100000 - 650


def test_real_failure_before_provider_releases_full(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    _fund()
    with pytest.raises(RuntimeError):
        with enforcement.enforce("ws_A", operation_type="content_text", source_product="content_agent",
                                 source_object_id="d1", operation_id="op1", estimate=_est(),
                                 is_mock=False) as op:
            raise RuntimeError("provider rejected")  # provider_succeeded never called
    assert wallet.balances("ws_A") == (100000, 0)  # fully released


def test_provider_delivered_then_persistence_fails_settles_not_refunds(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    _fund()
    with pytest.raises(RuntimeError):
        with enforcement.enforce("ws_A", operation_type="content_text", source_product="content_agent",
                                 source_object_id="d1", operation_id="op1", estimate=_est(),
                                 is_mock=False) as op:
            op.provider_succeeded(5000)   # provider delivered
            raise RuntimeError("db write failed")  # post-processing failure
    avail, reserved = wallet.balances("ws_A")
    assert reserved == 0 and avail == 100000 - 650   # settled, NOT refunded
    assert op.billing_state == "reconciliation_required"


def test_insufficient_credits_blocks_before_provider(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    _fund(amount=100)  # not enough
    called = {"provider": False}
    with pytest.raises(service.CreditError) as ei:
        with enforcement.enforce("ws_A", operation_type="content_text", source_product="content_agent",
                                 source_object_id="d1", operation_id="op1", estimate=_est(),
                                 is_mock=False) as op:
            called["provider"] = True  # body must NOT run
            op.provider_succeeded(5000)
    assert ei.value.code == "insufficient_credits"
    assert called["provider"] is False  # provider adapter never reached


def test_entitlement_block_when_enforced(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "true")
    _fund()
    # free plan does NOT include ai_influencer
    with pytest.raises(service.CreditError) as ei:
        with enforcement.enforce("ws_A", operation_type="influencer_idea", source_product="ai_influencer",
                                 source_object_id="x", operation_id="op1",
                                 estimate=estimate.influencer_idea_estimate("ws_A", is_mock=False),
                                 feature="ai_influencer", is_mock=False):
            pass
    assert ei.value.code == "feature_not_entitled"
    assert wallet.balances("ws_A") == (100000, 0)  # no hold placed


def test_duplicate_operation_id_does_not_double_charge(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    _fund()
    est = _est()
    for _ in range(2):  # duplicate HTTP retry, same operation_id
        with enforcement.enforce("ws_A", operation_type="content_text", source_product="content_agent",
                                 source_object_id="d1", operation_id="dup-op", estimate=est,
                                 is_mock=False) as op:
            op.provider_succeeded(5000)
    # one reservation, charged once
    active = [r for _i, r in get_reservation_repository().list("ws_A")]
    assert len(active) == 1
    assert wallet.balances("ws_A")[0] == 100000 - 650
