"""Contract tests for the AI Receptionist Supabase migrations (Wave 5, Part 7/8).

Hermetic (regex over raw SQL, no DB). FAILS when a durable table referenced by the
code (``service.stores.ALL_TABLES`` + worker jobs/attempts + campaign store) is not
created by a migration, when a table lacks a tenant index or RLS, or when the hot
idempotency / period / expiry expression indexes are missing.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent.parent
MIGRATIONS_DIR = REPO / "supabase" / "migrations"
RECEPTIONIST_MIGRATIONS = [
    MIGRATIONS_DIR / "20260709_ai_receptionist.sql",
    MIGRATIONS_DIR / "20260730_receptionist_foundation.sql",
    MIGRATIONS_DIR / "20260802_receptionist_google.sql",
    MIGRATIONS_DIR / "20260803_receptionist_whatsapp.sql",
    MIGRATIONS_DIR / "20260810_receptionist_meta_messaging.sql",
    MIGRATIONS_DIR / "20260817_receptionist_sms.sql",
    MIGRATIONS_DIR / "20260824_receptionist_telegram.sql",
]


def _sql() -> str:
    return "\n".join(f.read_text(encoding="utf-8") for f in RECEPTIONIST_MIGRATIONS if f.exists())


def _created_tables(sql: str) -> set[str]:
    return {m.lower() for m in re.findall(
        r"create\s+table\s+(?:if\s+not\s+exists\s+)?[\"']?([a-zA-Z0-9_]+)[\"']?", sql, re.I)
        if m.lower().startswith("receptionist_")}


def _rls_tables(sql: str) -> set[str]:
    return {m.lower() for m in re.findall(
        r'alter\s+table\s+[\"\']?([a-zA-Z0-9_]+)[\"\']?\s+enable\s+row\s+level\s+security', sql, re.I)}


def _all_code_tables() -> set[str]:
    from receptionist.service import stores
    tables = set(stores.ALL_TABLES)
    from receptionist.worker import jobs_store
    tables.update({jobs_store.T_JOBS, jobs_store.T_ATTEMPTS})
    return tables


def test_migration_files_exist():
    for f in RECEPTIONIST_MIGRATIONS:
        assert f.exists(), f"missing migration file: {f.name}"


def test_every_code_table_has_a_migration():
    created = _created_tables(_sql())
    missing = sorted(t for t in _all_code_tables() if t not in created)
    assert not missing, f"tables referenced in code but not migrated: {missing}"


def test_every_table_has_rls():
    rls = _rls_tables(_sql())
    missing = sorted(t for t in _all_code_tables() if t not in rls)
    assert not missing, f"tables missing RLS: {missing}"


def test_every_table_has_tenant_index():
    sql = _sql()
    # tenant index = an index whose target references ("tenant_id")
    tenant_indexed = set(re.findall(
        r'on\s+[\"\']?([a-zA-Z0-9_]+)[\"\']?\s*\(\s*[\"\']?tenant_id', sql, re.I))
    tenant_indexed = {t.lower() for t in tenant_indexed}
    missing = sorted(t for t in _all_code_tables() if t not in tenant_indexed)
    assert not missing, f"tables missing a tenant index: {missing}"


@pytest.mark.parametrize("table,field", [
    ("receptionist_message_index", "dedup_key"),
    ("receptionist_action_executions", "idempotency_key"),
    ("receptionist_locks", "expires_at"),
    ("receptionist_usage_counters", "period_start"),
    ("receptionist_config_versions", "status"),
    ("receptionist_send_log", "idempotency_key"),
    ("receptionist_worker_jobs", "status"),
    ("receptionist_consent", "phone"),
    ("receptionist_dnc", "phone"),
])
def test_hot_expression_indexes_present(table, field):
    sql = _sql()
    # match: on "<table>" ((...data->>'<field>'...))
    pattern = re.compile(
        r'on\s+[\"\']?' + re.escape(table) + r'[\"\']?\s*\(\([^)]*' + re.escape(field), re.I)
    assert pattern.search(sql), f"missing expression index on {table}.{field}"
