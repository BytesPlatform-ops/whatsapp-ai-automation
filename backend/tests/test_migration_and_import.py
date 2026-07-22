"""Validate the production migrations cover every durable table the code writes,
and exercise the file→Supabase import utility with an in-memory destination (no
network, no paid infra)."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

REPO = Path(__file__).resolve().parent.parent.parent
CA_MIGRATION = REPO / "supabase" / "migrations" / "20260723_content_agent.sql"
CC_MIGRATION = REPO / "landing" / "prisma" / "migrations" / "0004_content_creator" / "migration.sql"
PUB_MIGRATION = REPO / "supabase" / "migrations" / "20260724_publishing.sql"


def _created_tables(sql: str) -> set:
    import re
    return {m.lower() for m in re.findall(r'create\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z_]+)"?', sql, re.I)}


# ── Migration coverage ─────────────────────────────────────────────────────────
def test_migration_files_exist():
    assert CA_MIGRATION.exists()
    assert CC_MIGRATION.exists()


def test_content_agent_migration_covers_all_ca_tables():
    pytest.importorskip("pydantic")
    import content_agent.store as store
    code_tables = {
        store.DocumentRepository.table_name,
        store.VersionRepository.table_name,
        store.JobRepository.table_name,
        store.UsageRepository.table_name,
    }
    created = _created_tables(CA_MIGRATION.read_text())
    missing = code_tables - created
    assert not missing, f"content_agent tables missing from migration: {missing}"


def test_content_creator_migration_covers_all_cc_tables():
    pytest.importorskip("pydantic")
    import content_creator.store_durable as sd
    code_tables = {
        getattr(cls, "table_name")
        for cls in vars(sd).values()
        if isinstance(cls, type) and getattr(cls, "table_name", "")
    }
    assert code_tables, "no durable cc_ repositories discovered"
    created = _created_tables(CC_MIGRATION.read_text())
    missing = code_tables - created
    assert not missing, f"content_creator tables missing from migration: {missing}"


def test_migrations_enable_rls_or_are_prisma_managed():
    ca = CA_MIGRATION.read_text().lower()
    assert "enable row level security" in ca  # deny-all posture for the ca_ tables


def test_publishing_migration_covers_all_pub_tables():
    pytest.importorskip("pydantic")
    import publishing.store as store
    code_tables = {store.JobRepository.table_name, store.AttemptRepository.table_name}
    created = _created_tables(PUB_MIGRATION.read_text())
    missing = code_tables - created
    assert not missing, f"publishing tables missing from migration: {missing}"
    assert "enable row level security" in PUB_MIGRATION.read_text().lower()


# ── File → Supabase import utility ─────────────────────────────────────────────
from scripts.import_file_persistence_to_supabase import MigrationConflict, migrate


class _MemRepo:
    """Minimal in-memory destination repo (id+tenant keyed), matching persistence.Repo."""
    _store: dict = {}

    def __init__(self, name):
        self.name = name
        self._rows = _MemRepo._store.setdefault(name, {})

    def get(self, tenant_id, row_id):
        return self._rows.get((tenant_id, row_id))

    def upsert(self, row):
        self._rows[(row.get("tenant_id"), row.get("id"))] = row
        return row


@pytest.fixture
def dest():
    _MemRepo._store = {}
    yield lambda name: _MemRepo(name)
    _MemRepo._store = {}


def _seed_file(dir_path: Path, table: str, rows: list):
    (dir_path / f"row_{table}.json").write_text(json.dumps(rows), encoding="utf-8")


def _row(rid, tenant="ws_A", **data):
    return {"id": rid, "tenant_id": tenant, "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z", "data": data}


def test_dry_run_writes_nothing_but_counts(tmp_path, dest):
    _seed_file(tmp_path, "ca_documents", [_row("cadoc_1"), _row("cadoc_2")])
    s = migrate(tmp_path, dry_run=True, dest_table_factory=dest)
    t = s["tables"]["ca_documents"]
    assert t["found"] == 2 and t["new"] == 2 and t["migrated"] == 0
    # nothing actually written
    assert dest("ca_documents").get("ws_A", "cadoc_1") is None


def test_apply_migrates_and_preserves_identity(tmp_path, dest):
    _seed_file(tmp_path, "ca_documents", [_row("cadoc_1", title="Hello")])
    s = migrate(tmp_path, dry_run=False, dest_table_factory=dest)
    assert s["tables"]["ca_documents"]["migrated"] == 1
    got = dest("ca_documents").get("ws_A", "cadoc_1")
    assert got["id"] == "cadoc_1" and got["tenant_id"] == "ws_A"
    assert got["created_at"] == "2026-01-01T00:00:00Z"  # timestamp preserved
    assert got["data"]["title"] == "Hello"


def test_skip_existing_is_idempotent(tmp_path, dest):
    _seed_file(tmp_path, "ca_documents", [_row("cadoc_1")])
    migrate(tmp_path, dry_run=False, dest_table_factory=dest)
    s2 = migrate(tmp_path, dry_run=False, on_conflict="skip", dest_table_factory=dest)
    t = s2["tables"]["ca_documents"]
    assert t["existing"] == 1 and t["migrated"] == 0  # re-run migrates nothing


def test_fail_on_conflict_reports_and_raises(tmp_path, dest):
    _seed_file(tmp_path, "ca_documents", [_row("cadoc_1")])
    migrate(tmp_path, dry_run=False, dest_table_factory=dest)
    # dry-run with fail → conflicts counted, no raise
    s = migrate(tmp_path, dry_run=True, on_conflict="fail", dest_table_factory=dest)
    assert s["conflicts_total"] == 1
    # apply with fail → raises
    with pytest.raises(MigrationConflict):
        migrate(tmp_path, dry_run=False, on_conflict="fail", dest_table_factory=dest)


def test_only_filters_tables(tmp_path, dest):
    _seed_file(tmp_path, "ca_documents", [_row("d1")])
    _seed_file(tmp_path, "ca_versions", [_row("v1")])
    s = migrate(tmp_path, dry_run=True, only=["ca_versions"], dest_table_factory=dest)
    assert "ca_versions" in s["tables"] and "ca_documents" not in s["tables"]
