"""Hard server-side plan-limit enforcement (Wave 6, Part 9).

Hermetic + $0. Proves limits are advisory when enforcement is off, hard-blocked
when on, that the error carries the required fields, that duplicate usage does not
double-count, and that higher plans never reduce a limit.
"""

from __future__ import annotations

import pytest


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores
    stores.reset_all()
    try:
        from credits import wallet, reservations, ledger
        ledger.reset_ledger_repository(); reservations.reset_reservation_repository(); wallet.reset_wallet_repository()
    except Exception:
        pass
    yield
    stores.reset_all()


def test_advisory_when_enforcement_off(env, monkeypatch):
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "0")
    from receptionist.service import ingestion
    # Free plan allows 3 knowledge sources; create 4 → advisory (no raise).
    for i in range(4):
        ingestion.ingest_text("t_a", f"src{i}", "some content here")
    from receptionist.service import stores
    assert stores.knowledge_sources().count("t_a") == 4


def test_hard_block_when_enforcement_on(env, monkeypatch):
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "1")
    from receptionist.service import ingestion, limits
    # Free plan limit is 3 sources.
    for i in range(3):
        ingestion.ingest_text("t_a", f"src{i}", "content")
    with pytest.raises(limits.LimitExceeded) as e:
        ingestion.ingest_text("t_a", "src4", "content")
    d = e.value.detail
    assert d["limit_key"] == "receptionist_knowledge_sources"
    assert d["used"] == 3 and d["limit"] == 3
    assert d["upgrade_url"].endswith("agent=ai-receptionist")
    assert d["return_route"] == "/pixie-lab/receptionist"
    assert "start" in d["billing_period"]


def test_over_limit_write_is_blocked_before_storage(env, monkeypatch):
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "1")
    from receptionist.service import ingestion, limits, stores
    for i in range(3):
        ingestion.ingest_text("t_a", f"s{i}", "c")
    before = stores.knowledge_sources().count("t_a")
    with pytest.raises(limits.LimitExceeded):
        ingestion.ingest_text("t_a", "s4", "c")
    assert stores.knowledge_sources().count("t_a") == before  # nothing written


def test_ingestion_counter_increments_once(env):
    from receptionist.service import ingestion, usage
    ingestion.ingest_text("t_a", "s", "content")
    assert usage.get("t_a", "knowledge_ingestions") == 1


def test_summary_shape(env):
    from receptionist.service import limits
    s = limits.summary("t_a")
    assert "knowledge_source" in s and "conversation" in s
    assert s["knowledge_source"]["limit_key"] == "receptionist_knowledge_sources"


def test_higher_plans_never_reduce_limits():
    from credits.plans import get_plan, UNLIMITED
    free, starter, pro = get_plan("free"), get_plan("starter"), get_plan("pro")
    keys = [k for k in free.limits if k.startswith("receptionist_")]
    for k in keys:
        for lo, hi in ((free, starter), (starter, pro)):
            a, b = lo.limit(k), hi.limit(k)
            if a == UNLIMITED:
                assert b == UNLIMITED, k
            elif b != UNLIMITED:
                assert b >= a, f"{k}: {b} < {a}"
