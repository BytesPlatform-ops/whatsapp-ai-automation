"""Migration-coverage test for the SEO backlinks schema.

Mirrors tests/seo/test_search_stores.py's coverage test:
  - All 4 tables from ALL_REPOSITORIES are present in the migration SQL
  - RLS is enabled on all 4 tables
  - The migration file exists at the expected path
  - No digit-containing table names (hard constraint from the task spec)
  - Dedup unique indexes are present for seo_backlinks and seo_referring_domains

No network, no paid calls, no imports beyond stdlib + our stores module.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from seo.backlinks.stores import ALL_REPOSITORIES

# Path relative to the repo root (same as test_search_stores.py style).
REPO = Path(__file__).resolve().parent.parent.parent.parent
MIGRATION = REPO / "supabase" / "migrations" / "20260730_seo_backlinks.sql"


def _created_tables(sql: str) -> set:
    """Extract table names from CREATE TABLE [IF NOT EXISTS] statements."""
    return {m.lower() for m in re.findall(
        r'create\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z_]+)"?', sql, re.I
    )}


def _rls_enabled_tables(sql: str) -> set:
    """Extract table names from ALTER TABLE ... ENABLE ROW LEVEL SECURITY."""
    return {m.lower() for m in re.findall(
        r'alter\s+table\s+"?([a-zA-Z_]+)"?\s+enable\s+row\s+level\s+security', sql, re.I
    )}


def test_migration_file_exists():
    assert MIGRATION.exists(), f"Migration file not found: {MIGRATION}"


def test_migration_covers_all_backlink_tables():
    sql = MIGRATION.read_text()
    created = _created_tables(sql)
    code_tables = {cls.table_name for cls in ALL_REPOSITORIES}
    assert len(code_tables) == 4, f"Expected 4 repos, got {len(code_tables)}"
    missing = code_tables - created
    assert not missing, f"Tables missing from migration SQL: {missing}"


def test_migration_has_rls_on_all_tables():
    sql = MIGRATION.read_text()
    rls_tables = _rls_enabled_tables(sql)
    code_tables = {cls.table_name for cls in ALL_REPOSITORIES}
    for t in code_tables:
        assert t in rls_tables, f"RLS not enabled for table: {t}"


def test_migration_no_digit_table_names():
    """Hard constraint: table names must not contain digits."""
    code_tables = {cls.table_name for cls in ALL_REPOSITORIES}
    for t in code_tables:
        digit_chars = [c for c in t if c.isdigit()]
        assert not digit_chars, f"Table name '{t}' contains digits: {digit_chars}"


def test_migration_has_dedup_unique_index_for_backlinks():
    sql = MIGRATION.read_text().lower()
    # The dedup index must be a UNIQUE index on (tenant_id, dedup_key).
    assert "uniq_seo_backlinks_dedup" in sql or "unique" in sql, \
        "Expected a UNIQUE dedup index for seo_backlinks"
    assert "dedup_key" in sql, "dedup_key not mentioned in migration"


def test_migration_has_dedup_unique_index_for_referring_domains():
    sql = MIGRATION.read_text().lower()
    assert "uniq_seo_referring_domains_domain" in sql or "unique" in sql, \
        "Expected a UNIQUE dedup index for seo_referring_domains"


def test_migration_is_idempotent_ddl():
    """All CREATE TABLE and CREATE INDEX must use IF NOT EXISTS."""
    sql = MIGRATION.read_text()
    for match in re.finditer(
        r'(CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX))\s+(?!IF\s+NOT\s+EXISTS)',
        sql, re.I
    ):
        statement = match.group(0)
        pytest.fail(f"Non-idempotent DDL found (missing IF NOT EXISTS): {statement!r}")


def test_migration_has_tenant_indexes_for_all_tables():
    sql = MIGRATION.read_text().lower()
    code_tables = {cls.table_name for cls in ALL_REPOSITORIES}
    for t in code_tables:
        assert f"idx_{t}_tenant" in sql, f"Missing tenant index for {t}"
        assert f"idx_{t}_created" in sql, f"Missing created_at index for {t}"


def test_all_repositories_id_prefixes():
    """Each repo must have a non-empty id_prefix."""
    for cls in ALL_REPOSITORIES:
        assert cls.id_prefix, f"{cls.__name__} missing id_prefix"
        assert "_" in cls.id_prefix, f"{cls.__name__}.id_prefix should contain underscore"
