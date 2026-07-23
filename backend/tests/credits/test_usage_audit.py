"""Period usage counters (reservation-derived) + financial audit log."""

from __future__ import annotations

import pytest

from credits import audit, ledger, reservations, service, usage, wallet


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository, audit.reset_audit_repository):
        r()
    yield
    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository, audit.reset_audit_repository):
        r()


def _fund(t="ws_A", amount=100000):
    service.grant(t, amount, reason_code="seed", idempotency_key=f"seed:{t}")


def _reserve(t="ws_A", key="op", op="content_text", mc=1000):
    return service.reserve(t, operation_type=op, source_product="content_agent",
                           source_object_id="d", max_reserved_mc=mc, idempotency_key=key)


# ── usage counters ──────────────────────────────────────────────────────────────
def test_settled_operation_counts_once():
    _fund()
    rid, _ = _reserve(key="op1")
    service.settle("ws_A", rid, settle_mc=500)
    assert usage.count_operations("ws_A", "content_text") == 1


def test_released_operation_does_not_count():
    _fund()
    rid, _ = _reserve(key="op1")
    service.release("ws_A", rid, reason_code=service.REASON_PROVIDER_REJECTED)
    assert usage.count_operations("ws_A", "content_text") == 0


def test_duplicate_request_counts_once():
    _fund()
    a, _ = _reserve(key="dup")
    b, _ = _reserve(key="dup")  # same op
    service.settle("ws_A", a, settle_mc=500)
    assert usage.count_operations("ws_A", "content_text") == 1


def test_fallback_period_is_marked():
    start, end, fallback = usage.current_period("ws_A")
    assert fallback is True and start < end


def test_stripe_period_overrides_fallback():
    wallet.get_wallet_repository().set_plan_period("ws_A", plan_id="pro",
                                                   period_start="2026-07-01T00:00:00+00:00",
                                                   period_end="2026-08-01T00:00:00+00:00")
    start, end, fallback = usage.current_period("ws_A")
    assert fallback is False and start.startswith("2026-07-01")


def test_usage_summary_shape():
    _fund()
    rid, _ = _reserve(key="op1")
    service.settle("ws_A", rid, settle_mc=500)
    s = usage.usage_summary("ws_A")
    assert "period" in s and s["period"]["fallback"] is True
    text = next(c for c in s["counters"] if c["key"] == "content_text")
    assert text["used"] == 1 and text["limit"] == 10  # free plan


# ── audit ───────────────────────────────────────────────────────────────────────
def test_lifecycle_emits_audit_events():
    _fund()
    rid, _ = _reserve(key="op1")
    service.settle("ws_A", rid, settle_mc=500)
    types = {e.event_type for _i, e in audit.get_audit_repository().list("ws_A")}
    assert {"credits_granted", "reservation_created", "settlement_created"} <= types


def test_insufficient_credits_is_audited():
    _fund(amount=100)
    with pytest.raises(service.CreditError):
        _reserve(mc=5000)
    types = [e.event_type for _i, e in audit.get_audit_repository().list("ws_A")]
    assert "insufficient_credits" in types


def test_audit_redacts_secret_like_metadata():
    audit.emit("ws_A", "test", metadata={"access_token": "sk_live_xxx", "amount_mc": 500, "note": "ok"})
    _i, e = audit.get_audit_repository().list("ws_A")[0]
    assert "access_token" not in e.metadata and e.metadata.get("amount_mc") == 500
    assert "sk_live" not in str(e.metadata)


def test_audit_tenant_isolated():
    audit.emit("ws_A", "reservation_created")
    audit.emit("ws_B", "reservation_created")
    assert len(audit.get_audit_repository().list("ws_A")) == 1
    assert len(audit.get_audit_repository().list("ws_B")) == 1
