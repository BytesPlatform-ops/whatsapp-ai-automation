"""Durable credit persistence — restart recovery (file mode) + migration contract.

Proves financial state survives a repository/process restart and that the Supabase
migration matches the repositories (table names + queried JSON field paths)."""

from __future__ import annotations

import os
import re

import pytest

from credits import ledger, reservations, service, wallet
from credits.reservations import ReservationStatus


@pytest.fixture
def file_mode(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        r()
    yield
    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        r()


def _restart():
    """Discard the in-process repositories → next get_* rebuilds from disk."""
    ledger.reset_ledger_repository()
    wallet.reset_wallet_repository()
    reservations.reset_reservation_repository()


def test_financial_state_survives_restart(file_mode):
    service.grant("ws_A", 5000, reason_code="seed", idempotency_key="g")
    rid, _ = service.reserve("ws_A", operation_type="content_text", source_product="content_agent",
                             source_object_id="d1", max_reserved_mc=1300, idempotency_key="op1")
    assert wallet.balances("ws_A") == (3700, 1300)

    _restart()  # simulate process restart; durable file rows remain

    # ledger-derived balance is intact after restart
    assert wallet.balances("ws_A") == (3700, 1300)
    # settle the recovered reservation once
    service.settle("ws_A", rid, settle_mc=1000)
    assert wallet.balances("ws_A") == (4000, 0)
    _, r = reservations.get_reservation_repository().get("ws_A", rid)
    assert r.status == ReservationStatus.SETTLED.value


def test_idempotency_survives_restart(file_mode):
    service.grant("ws_A", 5000, reason_code="seed", idempotency_key="grant-1")
    _restart()
    # replaying the same grant after restart must NOT double-credit
    service.grant("ws_A", 5000, reason_code="seed", idempotency_key="grant-1")
    assert wallet.balances("ws_A")[0] == 5000


def test_reservation_enum_restored_from_disk(file_mode):
    service.grant("ws_A", 5000, reason_code="s", idempotency_key="g")
    rid, _ = service.reserve("ws_A", operation_type="content_text", source_product="content_agent",
                             source_object_id="d1", max_reserved_mc=1000, idempotency_key="op")
    _restart()
    _, r = reservations.get_reservation_repository().get("ws_A", rid)
    assert r.status == ReservationStatus.ACTIVE.value  # enum value round-trips


def test_tenant_isolation_survives_restart(file_mode):
    service.grant("ws_A", 5000, reason_code="s", idempotency_key="a")
    service.grant("ws_B", 999, reason_code="s", idempotency_key="b")
    _restart()
    assert wallet.balances("ws_A")[0] == 5000
    assert wallet.balances("ws_B")[0] == 999


# ── migration contract ──────────────────────────────────────────────────────────
MIGRATION = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..",
                                         "supabase", "migrations", "20260725_credits.sql"))


def _sql() -> str:
    with open(MIGRATION, encoding="utf-8") as f:
        return f.read()


def test_migration_defines_repository_table_names():
    sql = _sql()
    for table in (ledger.LedgerRepository.table_name, wallet.WalletRepository.table_name,
                  reservations.ReservationRepository.table_name):
        assert re.search(rf'CREATE TABLE IF NOT EXISTS "{table}"', sql), f"missing table {table}"


def test_migration_enforces_unique_idempotency_and_rls():
    sql = _sql()
    assert "uq_credit_ledger_idempotency" in sql and "uq_credit_res_idempotency" in sql
    assert sql.count("ENABLE ROW LEVEL SECURITY") == 3


def test_migration_indexes_match_queried_fields():
    sql = _sql()
    # fields the repositories filter/sort on must be indexed
    for path in ("data->>'entry_type'", "data->>'status'", "data->>'expires_at'",
                 "data->>'idempotency_key'", "data->>'provider_operation_id'"):
        assert path in sql, f"missing index on {path}"
