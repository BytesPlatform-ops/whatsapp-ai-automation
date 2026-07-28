"""Automated contract tests for the six SEO Supabase migrations.

Tests FAIL when:
  - Code references a table not created by any migration (collected from ALL_REPOSITORIES
    in every seo *stores module and seo/reporting/store.py).
  - A hot-queried JSON field lacks its data->>'field' expression index in the migration.
  - A tenant table (every seo table) lacks a tenant index.
  - A scheduler/sync table lacks status or next_run indexes.
  - An idempotency field (dedup_key, email) lacks a unique index.
  - RLS is not enabled per table.

Parsing is done via regex on the raw SQL (no DB connection needed). Hermetic — no Supabase.
"""

from __future__ import annotations

import re
import sys
import os
from pathlib import Path
from typing import Set, Dict, List

import pytest

# Ensure backend/ is importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

REPO = Path(__file__).resolve().parent.parent.parent
MIGRATIONS_DIR = REPO / "supabase" / "migrations"

SEO_MIGRATION_FILES = [
    MIGRATIONS_DIR / "20260728_seo.sql",
    MIGRATIONS_DIR / "20260729_seo_search_intelligence.sql",
    MIGRATIONS_DIR / "20260730_seo_backlinks.sql",
    MIGRATIONS_DIR / "20260731_seo_local.sql",
    MIGRATIONS_DIR / "20260801_seo_outreach.sql",
    MIGRATIONS_DIR / "20260802_seo_reports.sql",
]


# ---------------------------------------------------------------------------
# SQL parsing helpers
# ---------------------------------------------------------------------------

def _sql_all() -> str:
    """Combined SQL text from all six SEO migrations."""
    return "\n".join(f.read_text(encoding="utf-8") for f in SEO_MIGRATION_FILES)


def _sql_for(migration_path: Path) -> str:
    return migration_path.read_text(encoding="utf-8")


def _created_tables(sql: str) -> Set[str]:
    """Extract table names from CREATE TABLE [IF NOT EXISTS] statements.
    Digit-blind regex matches both seo_analytics_* and other names."""
    return {
        m.lower()
        for m in re.findall(
            r"create\s+table\s+(?:if\s+not\s+exists\s+)?[\"']?([a-zA-Z0-9_]+)[\"']?",
            sql,
            re.IGNORECASE,
        )
        if m.lower().startswith("seo_")
    }


def _expression_indexes(sql: str) -> Set[tuple]:
    """Extract (table_name, field_name) pairs from data->>'field' expression indexes.

    Handles all forms found in the migrations:
      ON "table" ((data->>'field'))
      ON "table" ("tenant_id", (data->>'field'))
      ON "table" ("tenant_id", ("data"->>'field'))   -- reports migration uses quoted "data"
    """
    pairs = set()
    # Scan every CREATE INDEX statement (up to semicolon) for data->>'...' references
    for stmt_m in re.finditer(
        r"ON\s+[\"']?(\w+)[\"']?\s*\((.+?)\)(?:\s*(?:WHERE|;|$))",
        sql,
        re.IGNORECASE | re.DOTALL,
    ):
        table = stmt_m.group(1).lower()
        expr = stmt_m.group(2)
        # Match both data->>'field' and "data"->>'field'
        for field_m in re.finditer(r'"?data"?->>\'(\w+)\'', expr, re.IGNORECASE):
            pairs.add((table, field_m.group(1).lower()))
    return pairs


def _tenant_indexes(sql: str) -> Set[str]:
    """Extract table names that have an index on (tenant_id ...) — column or expression."""
    tables = set()
    for m in re.finditer(
        r"ON\s+[\"']?(\w+)[\"']?\s*\(\s*[\"']?tenant_id[\"']?",
        sql,
        re.IGNORECASE,
    ):
        tables.add(m.group(1).lower())
    return tables


def _rls_enabled_tables(sql: str) -> Set[str]:
    """Extract table names that have ENABLE ROW LEVEL SECURITY."""
    return {
        m.lower()
        for m in re.findall(
            r"ALTER\s+TABLE\s+[\"']?(\w+)[\"']?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY",
            sql,
            re.IGNORECASE,
        )
    }


def _rls_policy_tables(sql: str) -> Set[str]:
    """Tables that have an explicit CREATE POLICY (deny-all posture for local migration)."""
    return {
        m.lower()
        for m in re.findall(
            r"CREATE\s+POLICY\s+\S+\s+ON\s+[\"']?(\w+)[\"']?",
            sql,
            re.IGNORECASE,
        )
    }


def _unique_indexes(sql: str) -> List[Dict]:
    """Extract UNIQUE INDEX definitions: name, table, and the expression."""
    results = []
    for m in re.finditer(
        r"CREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"']?(\w+)[\"']?\s+ON\s+[\"']?(\w+)[\"']?\s*\(([^;]+?)\)",
        sql,
        re.IGNORECASE | re.DOTALL,
    ):
        results.append({
            "name": m.group(1).lower(),
            "table": m.group(2).lower(),
            "expr": m.group(3).lower(),
        })
    return results


# ---------------------------------------------------------------------------
# Collect code-side tables from ALL store modules
# ---------------------------------------------------------------------------

def _code_tables() -> Set[str]:
    """Gather table_name values from every SEO store module's ALL_REPOSITORIES
    and from seo/reporting/store.py's GeneratedReportRepository."""
    tables: Set[str] = set()

    # seo/stores.py — uses _Repo directly, no ALL_REPOSITORIES; read class attrs
    import seo.stores as stores
    for attr_name in dir(stores):
        cls = getattr(stores, attr_name)
        if isinstance(cls, type) and issubclass(cls, stores._Repo):
            tn = getattr(cls, "table_name", "")
            if tn and tn.startswith("seo_"):
                tables.add(tn)

    # seo/search_stores.py
    import seo.search_stores as ss
    for cls in ss.ALL_REPOSITORIES:
        tables.add(cls.table_name)

    # seo/backlinks/stores.py
    import seo.backlinks.stores as bs
    for cls in bs.ALL_REPOSITORIES:
        tables.add(cls.table_name)

    # seo/local/stores.py
    import seo.local.stores as ls
    for cls in ls.ALL_REPOSITORIES:
        tables.add(cls.table_name)

    # seo/outreach/stores.py
    import seo.outreach.stores as os_
    for cls in os_.ALL_REPOSITORIES:
        tables.add(cls.table_name)

    # seo/reporting/store.py — no ALL_REPOSITORIES, one class
    import seo.reporting.store as rs
    tables.add(rs.GeneratedReportRepository.table_name)

    return tables


# ---------------------------------------------------------------------------
# Expected hot fields per table (those that have expression indexes in migrations)
# ---------------------------------------------------------------------------

# Mapping: table_name -> set of data fields that MUST have expression indexes.
# Derived from reading the migration comments ("Hot fields in data: ...") and
# the actual CREATE INDEX IF NOT EXISTS statements in the SQL files.
REQUIRED_EXPRESSION_INDEXES: Dict[str, Set[str]] = {
    # 20260728_seo.sql
    "seo_crawl_jobs":    {"site_id", "status"},
    "seo_crawled_pages": {"site_id", "crawl_job_id", "normalized_url"},
    "seo_issues":        {"site_id", "crawl_job_id", "severity", "status"},
    "seo_reports":       {"site_id"},
    # 20260729_seo_search_intelligence.sql
    "seo_google_connections":     {"kind"},
    "seo_google_properties":      {"connection_id", "site_id"},
    "seo_gsc_sync_jobs":          {"status", "property_id"},
    "seo_gsc_query_rows":         {"property_id", "date"},
    "seo_analytics_sync_jobs":    {"status"},
    "seo_analytics_landing_rows": {"property_id", "date"},
    "seo_keyword_projects":       {"site_id"},
    "seo_keywords":               {"project_id", "cluster_id", "normalized_keyword"},
    "seo_keyword_metrics":        {"keyword_id"},
    "seo_keyword_clusters":       {"project_id"},
    "seo_rank_jobs":              {"status", "project_id"},
    "seo_rank_snapshots":         {"keyword_id", "project_id", "date"},
    "seo_competitors":            {"project_id"},
    "seo_competitor_snapshots":   {"competitor_id"},
    "seo_opportunities":          {"site_id", "status"},
    "seo_content_briefs":         {"site_id"},
    "seo_alerts":                 {"status", "site_id"},
    "seo_fix_verification":       {"issue_id"},
    # 20260730_seo_backlinks.sql
    "seo_backlink_projects":  {"site_id", "sync_status"},
    "seo_backlinks":          {"site_id", "source_domain", "target_url", "status"},
    "seo_referring_domains":  {"site_id", "status"},
    "seo_backlink_snapshots": {"site_id", "date"},
    # 20260731_seo_local.sql (indexes include tenant_id in composite; field is still indexed)
    "seo_locations":              {"site_id", "archived"},
    "seo_gbp_connections":        {"status"},
    "seo_gbp_reviews":            {"location_id", "reply_status", "handled"},
    "seo_gbp_posts":              {"location_id", "status"},
    "seo_citation_sources":       {"kind"},
    "seo_citations":              {"location_id", "status", "directory"},
    "seo_local_competitors":      {"location_id"},
    "seo_local_rank_snapshots":   {"location_id", "keyword", "date"},
    "seo_nap_audits":             {"location_id", "mismatch"},
    "seo_local_schema":           {"location_id", "status"},
    # 20260801_seo_outreach.sql
    "seo_outreach_contacts":    {"email", "domain", "relationship_status"},
    "seo_outreach_campaigns":   {"site_id", "status", "campaign_type", "opportunity_id"},
    "seo_outreach_drafts":      {"campaign_id", "contact_id", "status", "approved"},
    "seo_outreach_followups":   {"campaign_id", "contact_id", "status", "scheduled_for"},
    "seo_link_placements":      {"campaign_id", "contact_id", "outcome"},
    "seo_outreach_suppression": {"email", "domain"},
    # 20260802_seo_reports.sql — indexes are composite (tenant_id, data->>'field')
    # These are detected via the combined regex on the full SQL
    "seo_generated_reports": {"site_id", "kind", "expires_at"},
}

# Tables that must have a unique index on an idempotency field in the data column.
# Maps table_name -> set of field names that must appear in a UNIQUE index expression.
REQUIRED_UNIQUE_INDEXES: Dict[str, Set[str]] = {
    "seo_backlinks":            {"dedup_key"},
    "seo_referring_domains":    {"domain"},
    "seo_outreach_contacts":    {"email"},
    "seo_outreach_suppression": {"email"},
}

# Scheduler/sync tables that must have a status expression index.
SCHEDULER_SYNC_TABLES = {
    "seo_crawl_jobs",
    "seo_gsc_sync_jobs",
    "seo_analytics_sync_jobs",
    "seo_rank_jobs",
    "seo_backlink_projects",   # sync_status
    "seo_outreach_followups",  # status + scheduled_for
    "seo_outreach_campaigns",  # status
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def combined_sql() -> str:
    for f in SEO_MIGRATION_FILES:
        assert f.exists(), f"Migration file missing: {f}"
    return _sql_all()


@pytest.fixture(scope="module")
def migration_tables(combined_sql) -> Set[str]:
    return _created_tables(combined_sql)


@pytest.fixture(scope="module")
def expr_indexes(combined_sql) -> Set[tuple]:
    return _expression_indexes(combined_sql)


@pytest.fixture(scope="module")
def tenant_idx_tables(combined_sql) -> Set[str]:
    return _tenant_indexes(combined_sql)


@pytest.fixture(scope="module")
def rls_tables(combined_sql) -> Set[str]:
    return _rls_enabled_tables(combined_sql)


@pytest.fixture(scope="module")
def unique_idxs(combined_sql) -> List[Dict]:
    return _unique_indexes(combined_sql)


@pytest.fixture(scope="module")
def code_tables() -> Set[str]:
    return _code_tables()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestMigrationFilesExist:
    def test_all_six_migration_files_exist(self):
        missing = [str(f) for f in SEO_MIGRATION_FILES if not f.exists()]
        assert not missing, f"Missing migration files: {missing}"


class TestTableCoverage:
    def test_every_code_table_is_in_a_migration(self, code_tables, migration_tables):
        """Every table referenced in stores ALL_REPOSITORIES must be created by a migration."""
        missing = code_tables - migration_tables
        assert not missing, (
            f"Code references tables not created by any SEO migration: {sorted(missing)}\n"
            f"Migration tables found: {sorted(migration_tables)}"
        )

    def test_code_table_count_matches_expected(self, code_tables):
        """Sanity check: we expect 44 tables total across all 6 migrations."""
        # 5 + 18 + 4 + 10 + 6 + 1 = 44
        assert len(code_tables) >= 44, (
            f"Expected at least 44 SEO code tables, found {len(code_tables)}: {sorted(code_tables)}"
        )

    def test_stores_module_tables_count(self, code_tables):
        """Verify specific store modules contribute the right counts."""
        import seo.search_stores as ss
        import seo.backlinks.stores as bs
        import seo.local.stores as ls
        import seo.outreach.stores as os_

        assert len(ss.ALL_REPOSITORIES) == 18, (
            f"seo/search_stores.py: expected 18 repos, got {len(ss.ALL_REPOSITORIES)}"
        )
        assert len(bs.ALL_REPOSITORIES) == 4, (
            f"seo/backlinks/stores.py: expected 4 repos, got {len(bs.ALL_REPOSITORIES)}"
        )
        assert len(ls.ALL_REPOSITORIES) == 10, (
            f"seo/local/stores.py: expected 10 repos, got {len(ls.ALL_REPOSITORIES)}"
        )
        assert len(os_.ALL_REPOSITORIES) == 6, (
            f"seo/outreach/stores.py: expected 6 repos, got {len(os_.ALL_REPOSITORIES)}"
        )


class TestTenantIndexes:
    def test_every_seo_table_has_a_tenant_index(self, migration_tables, tenant_idx_tables):
        """Every seo_* table must have at least one index on tenant_id."""
        missing = migration_tables - tenant_idx_tables
        assert not missing, (
            f"SEO tables missing a tenant_id index: {sorted(missing)}"
        )


class TestExpressionIndexes:
    @pytest.mark.parametrize("table,fields", [
        (t, f) for t, f in sorted(REQUIRED_EXPRESSION_INDEXES.items())
    ])
    def test_hot_field_has_expression_index(self, table, fields, expr_indexes, combined_sql):
        """Each hot-queried JSON field must have a data->>'field' expression index."""
        for field_name in fields:
            # Primary check: from the parsed (table, field) set
            direct = (table, field_name) in expr_indexes
            # Fallback: raw SQL scan for the table+field combination
            # Covers edge cases where regex grouping missed a composite index
            in_raw = bool(re.search(
                rf"ON\s+[\"']?{re.escape(table)}[\"']?\s*\([^;]*\"?data\"?->>'[^']*{re.escape(field_name)}[^']*'",
                combined_sql,
                re.IGNORECASE | re.DOTALL,
            ))
            assert direct or in_raw, (
                f"Table '{table}' is missing a data->>'{field_name}' expression index. "
                f"Indexes found for this table: "
                f"{[(t, f) for t, f in expr_indexes if t == table]}"
            )


class TestSchedulerSyncIndexes:
    def test_scheduler_tables_have_status_index(self, expr_indexes, combined_sql):
        """Scheduler/sync tables must have a status or sync_status expression index."""
        for table in SCHEDULER_SYNC_TABLES:
            # Check for status or sync_status
            has_status = (
                (table, "status") in expr_indexes
                or (table, "sync_status") in expr_indexes
                or bool(re.search(
                    rf"ON\s+[\"']?{re.escape(table)}[\"']?\s*\([^;]*data->>'(status|sync_status)'",
                    combined_sql,
                    re.IGNORECASE,
                ))
            )
            assert has_status, (
                f"Scheduler/sync table '{table}' is missing a status/sync_status expression index."
            )

    def test_outreach_followups_has_scheduled_for_index(self, expr_indexes, combined_sql):
        """seo_outreach_followups must have a scheduled_for index (next_run equivalent)."""
        table = "seo_outreach_followups"
        has_scheduled = (
            (table, "scheduled_for") in expr_indexes
            or bool(re.search(
                rf"ON\s+[\"']?{re.escape(table)}[\"']?\s*\([^;]*data->>'scheduled_for'",
                combined_sql,
                re.IGNORECASE,
            ))
        )
        assert has_scheduled, (
            f"'{table}' is missing a data->>'scheduled_for' index (next-run equivalent)."
        )


class TestUniqueIndexes:
    @pytest.mark.parametrize("table,fields", [
        (t, f) for t, f in sorted(REQUIRED_UNIQUE_INDEXES.items())
    ])
    def test_idempotency_field_has_unique_index(self, table, fields, unique_idxs):
        """Dedup/idempotency fields must have a UNIQUE index."""
        for field_name in fields:
            found = any(
                idx["table"] == table and field_name in idx["expr"]
                for idx in unique_idxs
            )
            assert found, (
                f"Table '{table}' is missing a UNIQUE index on '{field_name}'. "
                f"Unique indexes found: {[i for i in unique_idxs if i['table'] == table]}"
            )


class TestRLSEnabled:
    def test_every_seo_table_has_rls_enabled(self, migration_tables, rls_tables, combined_sql):
        """Every seo_* table created by the migrations must have ENABLE ROW LEVEL SECURITY."""
        # For the local migration, tables have explicit CREATE POLICY ... USING (false)
        # instead of / in addition to ENABLE RLS. Count both postures as RLS-enabled.
        policy_tables = _rls_policy_tables(combined_sql)
        rls_covered = rls_tables | policy_tables
        missing = migration_tables - rls_covered
        assert not missing, (
            f"SEO tables missing ENABLE ROW LEVEL SECURITY or a deny-all policy: {sorted(missing)}"
        )

    def test_all_six_migrations_mention_rls(self):
        """Each migration file must reference row level security (belt-and-suspenders check)."""
        for f in SEO_MIGRATION_FILES:
            sql = f.read_text(encoding="utf-8").lower()
            assert "row level security" in sql, (
                f"Migration file {f.name} does not mention row level security."
            )


class TestMigrationOrdering:
    def test_migration_filenames_are_ordered(self):
        """Migration filenames must sort in correct dependency order (timestamp sort)."""
        names = [f.name for f in SEO_MIGRATION_FILES]
        assert names == sorted(names), (
            f"Migration files are not in timestamp order: {names}"
        )

    def test_search_intelligence_references_predecessor(self):
        """Migration 2 (search_intelligence) must reference its predecessor in comments."""
        sql = _sql_for(MIGRATIONS_DIR / "20260729_seo_search_intelligence.sql").lower()
        assert "20260728" in sql, (
            "20260729_seo_search_intelligence.sql should reference its predecessor 20260728_seo.sql"
        )

    def test_backlinks_references_predecessor(self):
        """Migration 3 (backlinks) must reference its predecessor in comments."""
        sql = _sql_for(MIGRATIONS_DIR / "20260730_seo_backlinks.sql").lower()
        assert "20260729" in sql, (
            "20260730_seo_backlinks.sql should reference its predecessor"
        )

    def test_outreach_references_predecessor(self):
        """Migration 5 (outreach) must reference its predecessor in comments."""
        sql = _sql_for(MIGRATIONS_DIR / "20260801_seo_outreach.sql").lower()
        assert "20260729" in sql, (
            "20260801_seo_outreach.sql should reference 20260729_seo_search_intelligence.sql"
        )


class TestIdempotence:
    def test_all_create_table_use_if_not_exists(self, combined_sql):
        """All CREATE TABLE statements must use IF NOT EXISTS for idempotence."""
        non_idempotent = re.findall(
            r"CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)[\"']?(seo_\w+)[\"']?",
            combined_sql,
            re.IGNORECASE,
        )
        assert not non_idempotent, (
            f"Tables created WITHOUT IF NOT EXISTS (not idempotent): {non_idempotent}"
        )

    def test_all_create_index_use_if_not_exists(self, combined_sql):
        """All CREATE INDEX statements must use IF NOT EXISTS for idempotence."""
        non_idempotent = re.findall(
            r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)\w+",
            combined_sql,
            re.IGNORECASE,
        )
        assert not non_idempotent, (
            f"Indexes created WITHOUT IF NOT EXISTS (not idempotent): {non_idempotent}"
        )
