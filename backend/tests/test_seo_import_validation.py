"""SEO import validation tests — in-memory destination pattern.

Uses the same _MemRepo / migrate() pattern as test_migration_and_import.py
(see backend/tests/test_migration_and_import.py) to assert that the importer
correctly handles SEO table rows for all six migration groups.

Assertions cover:
  - id / tenant_id / timestamps / data are preserved verbatim (envelope fidelity)
  - Enum values round-trip correctly as strings
  - archived field is preserved
  - Token-sealed fields (access_token_sealed, refresh_token_sealed) are migrated
    as opaque strings — their VALUES are NEVER printed, only their key presence
  - Financial/quota references (byte_size, sha256) are preserved
  - Duplicate rows: skip / fail / on_conflict modes
  - Dry-run: counts correct, nothing written
  - Partial import (--only TABLE): only named tables migrated
  - Rerun idempotence: second run skips all existing rows
  - Summary keys present: found / new / existing / migrated / conflicts
  - Never prints token / credential values

No network. No Supabase. Hermetic.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Callable, Dict, Optional

import pytest

# Ensure backend/ is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scripts.import_file_persistence_to_supabase import MigrationConflict, migrate


# ---------------------------------------------------------------------------
# In-memory destination (same contract as test_migration_and_import.py)
# ---------------------------------------------------------------------------

class _MemRepo:
    """Minimal in-memory destination repo (id+tenant keyed), matching persistence.Repo."""
    _store: Dict = {}

    def __init__(self, name: str):
        self.name = name
        self._rows = _MemRepo._store.setdefault(name, {})

    def get(self, tenant_id: str, row_id: str):
        return self._rows.get((tenant_id, row_id))

    def upsert(self, row: dict):
        self._rows[(row.get("tenant_id"), row.get("id"))] = row
        return row


@pytest.fixture
def dest():
    """Fresh in-memory destination; reset before and after each test."""
    _MemRepo._store = {}
    yield lambda name: _MemRepo(name)
    _MemRepo._store = {}


# ---------------------------------------------------------------------------
# Row builders matching the SEO envelope convention
# ---------------------------------------------------------------------------

def _row(rid: str, tenant: str = "ws_seo", **data) -> dict:
    """Build a normalised row envelope for any SEO table."""
    return {
        "id": rid,
        "tenant_id": tenant,
        "created_at": "2026-07-28T10:00:00Z",
        "updated_at": "2026-07-28T11:00:00Z",
        "data": data,
    }


def _seed(dir_path: Path, table: str, rows: list) -> None:
    (dir_path / f"row_{table}.json").write_text(json.dumps(rows), encoding="utf-8")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _summary_keys_ok(table_stat: dict) -> bool:
    """Check all five summary keys are present."""
    return all(k in table_stat for k in ("found", "new", "existing", "migrated", "conflicts"))


# ===========================================================================
# Group 1 — seo_sites, seo_crawl_jobs, seo_crawled_pages, seo_issues, seo_reports
# (20260728_seo.sql)
# ===========================================================================

class TestCrawlerPipelineTables:
    def test_seo_sites_envelope_fidelity(self, tmp_path, dest):
        """id/tenant/timestamps/data preserved for seo_sites."""
        _seed(tmp_path, "seo_sites", [
            _row("site_abc", domain="example.com", connection_status="connected",
                 crawl_frequency="weekly", archived=False)
        ])
        s = migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_sites").get("ws_seo", "site_abc")
        assert got is not None
        assert got["id"] == "site_abc"
        assert got["tenant_id"] == "ws_seo"
        assert got["created_at"] == "2026-07-28T10:00:00Z"
        assert got["updated_at"] == "2026-07-28T11:00:00Z"
        assert got["data"]["domain"] == "example.com"
        assert got["data"]["archived"] is False
        assert s["tables"]["seo_sites"]["migrated"] == 1

    def test_seo_sites_archived_flag_preserved(self, tmp_path, dest):
        """archived=True is preserved (soft-delete field)."""
        _seed(tmp_path, "seo_sites", [
            _row("site_arc", archived=True, archived_at="2026-07-28T12:00:00Z")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_sites").get("ws_seo", "site_arc")
        assert got["data"]["archived"] is True
        assert got["data"]["archived_at"] == "2026-07-28T12:00:00Z"

    def test_seo_crawl_jobs_enum_preserved(self, tmp_path, dest):
        """CrawlStatus enum value is preserved as string."""
        _seed(tmp_path, "seo_crawl_jobs", [
            _row("crawl_1", site_id="site_abc", status="completed", crawl_type="site")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_crawl_jobs").get("ws_seo", "crawl_1")
        assert got["data"]["status"] == "completed"
        assert got["data"]["crawl_type"] == "site"

    def test_seo_crawled_pages_preserved(self, tmp_path, dest):
        """CrawledPage fields preserved including normalized_url."""
        _seed(tmp_path, "seo_crawled_pages", [
            _row("page_1", site_id="site_abc", crawl_job_id="crawl_1",
                 url="https://example.com/page", normalized_url="https://example.com/page",
                 status_code=200, title="My Page")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_crawled_pages").get("ws_seo", "page_1")
        assert got["data"]["normalized_url"] == "https://example.com/page"
        assert got["data"]["status_code"] == 200

    def test_seo_issues_enum_preserved(self, tmp_path, dest):
        """SeoIssue severity + status enums preserved as strings."""
        _seed(tmp_path, "seo_issues", [
            _row("issue_1", site_id="site_abc", crawl_job_id="crawl_1",
                 page_id="page_1", rule_key="missing_title",
                 severity="high", status="open")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_issues").get("ws_seo", "issue_1")
        assert got["data"]["severity"] == "high"
        assert got["data"]["status"] == "open"

    def test_seo_reports_preserved(self, tmp_path, dest):
        """Report score and category_scores preserved."""
        _seed(tmp_path, "seo_reports", [
            _row("rpt_1", site_id="site_abc", crawl_job_id="crawl_1",
                 score=82, category_scores={"technical": 90, "content": 74})
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_reports").get("ws_seo", "rpt_1")
        assert got["data"]["score"] == 82
        assert got["data"]["category_scores"]["technical"] == 90


# ===========================================================================
# Group 2 — seo_google_connections (token-sealed fields)
# (20260729_seo_search_intelligence.sql)
# ===========================================================================

class TestSearchIntelligenceTables:
    def test_google_connection_token_sealed_migrated_but_not_printed(
        self, tmp_path, dest, capsys
    ):
        """Sealed token fields are migrated as opaque strings; their values are NOT printed."""
        sealed_ref = "enc:aes256gcm:base64encodedciphertext..."
        _seed(tmp_path, "seo_google_connections", [
            _row("gconn_1", kind="gsc", account_email="user@example.com",
                 status="connected",
                 access_token_sealed=sealed_ref,
                 refresh_token_sealed=sealed_ref,
                 scopes=["webmasters.readonly"])
        ])
        s = migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_google_connections").get("ws_seo", "gconn_1")
        # Sealed values preserved verbatim in destination
        assert got["data"]["access_token_sealed"] == sealed_ref
        assert got["data"]["refresh_token_sealed"] == sealed_ref
        assert got["data"]["account_email"] == "user@example.com"
        assert s["tables"]["seo_google_connections"]["migrated"] == 1

        # Verify the sealed values are NOT printed to stdout
        captured = capsys.readouterr()
        assert sealed_ref not in captured.out, (
            "Token values must never be printed to stdout."
        )

    def test_keyword_project_preserved(self, tmp_path, dest):
        """KeywordProject fields preserved."""
        _seed(tmp_path, "seo_keyword_projects", [
            _row("kwproj_1", site_id="site_abc", name="Launch Campaign",
                 device="mobile")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_keyword_projects").get("ws_seo", "kwproj_1")
        assert got["data"]["device"] == "mobile"
        assert got["data"]["name"] == "Launch Campaign"

    def test_rank_snapshot_enum_preserved(self, tmp_path, dest):
        """RankSnapshot date + position preserved."""
        _seed(tmp_path, "seo_rank_snapshots", [
            _row("ranksnap_1", keyword_id="kw_1", project_id="kwproj_1",
                 date="2026-07-01", position=5)
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_rank_snapshots").get("ws_seo", "ranksnap_1")
        assert got["data"]["date"] == "2026-07-01"
        assert got["data"]["position"] == 5

    def test_opportunity_status_enum_preserved(self, tmp_path, dest):
        """SeoOpportunity status preserved."""
        _seed(tmp_path, "seo_opportunities", [
            _row("opp_1", site_id="site_abc", opp_type="low_ctr",
                 status="open", priority_score=75.5)
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_opportunities").get("ws_seo", "opp_1")
        assert got["data"]["status"] == "open"
        assert got["data"]["priority_score"] == 75.5

    def test_alert_enum_preserved(self, tmp_path, dest):
        """SeoAlert severity + status preserved."""
        _seed(tmp_path, "seo_alerts", [
            _row("alert_1", alert_type="rank_drop", severity="critical",
                 status="unread", site_id="site_abc")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_alerts").get("ws_seo", "alert_1")
        assert got["data"]["severity"] == "critical"
        assert got["data"]["status"] == "unread"


# ===========================================================================
# Group 3 — seo_backlinks (dedup_key field)
# (20260730_seo_backlinks.sql)
# ===========================================================================

class TestBacklinksTables:
    def test_backlink_dedup_key_preserved(self, tmp_path, dest):
        """dedup_key (idempotency field) preserved verbatim."""
        _seed(tmp_path, "seo_backlinks", [
            _row("bl_1", site_id="site_abc", dedup_key="source.com::target/page",
                 source_domain="source.com", target_url="https://example.com/page",
                 status="active")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_backlinks").get("ws_seo", "bl_1")
        assert got["data"]["dedup_key"] == "source.com::target/page"
        assert got["data"]["status"] == "active"

    def test_referring_domain_domain_field_preserved(self, tmp_path, dest):
        """domain (unique key) field preserved."""
        _seed(tmp_path, "seo_referring_domains", [
            _row("bldom_1", site_id="site_abc", domain="source.com", status="active",
                 domain_authority=45)
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_referring_domains").get("ws_seo", "bldom_1")
        assert got["data"]["domain"] == "source.com"
        assert got["data"]["domain_authority"] == 45


# ===========================================================================
# Group 4 — seo_gbp_connections (sealed tokens), seo_locations (archived)
# (20260731_seo_local.sql)
# ===========================================================================

class TestLocalTables:
    def test_gbp_connection_token_sealed_not_printed(self, tmp_path, dest, capsys):
        """GBP token sealed fields migrated but not printed."""
        sealed = "enc:v1:gbptoken..."
        _seed(tmp_path, "seo_gbp_connections", [
            _row("gbpconn_1", status="connected",
                 access_token_sealed=sealed,
                 refresh_token_sealed=sealed)
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_gbp_connections").get("ws_seo", "gbpconn_1")
        assert got["data"]["access_token_sealed"] == sealed
        captured = capsys.readouterr()
        assert sealed not in captured.out, "GBP token must not be printed."

    def test_location_archived_field_preserved(self, tmp_path, dest):
        """Location archived flag preserved."""
        _seed(tmp_path, "seo_locations", [
            _row("loc_1", site_id="site_abc", name="Main Office",
                 archived=False, city="London")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_locations").get("ws_seo", "loc_1")
        assert got["data"]["archived"] is False
        assert got["data"]["city"] == "London"

    def test_gbp_review_reply_status_preserved(self, tmp_path, dest):
        """GBP review reply_status enum preserved."""
        _seed(tmp_path, "seo_gbp_reviews", [
            _row("gbprev_1", location_id="loc_1", reply_status="drafted",
                 handled="false", rating=4)
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_gbp_reviews").get("ws_seo", "gbprev_1")
        assert got["data"]["reply_status"] == "drafted"

    def test_citation_status_preserved(self, tmp_path, dest):
        """Citation status preserved."""
        _seed(tmp_path, "seo_citations", [
            _row("cit_1", location_id="loc_1", status="live",
                 directory="yelp.com")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_citations").get("ws_seo", "cit_1")
        assert got["data"]["status"] == "live"
        assert got["data"]["directory"] == "yelp.com"


# ===========================================================================
# Group 5 — seo_outreach_contacts (email unique), seo_outreach_suppression
# (20260801_seo_outreach.sql)
# ===========================================================================

class TestOutreachTables:
    def test_outreach_contact_email_preserved(self, tmp_path, dest):
        """Contact email (unique idempotency field) preserved."""
        _seed(tmp_path, "seo_outreach_contacts", [
            _row("oc_1", domain="partner.com", email="editor@partner.com",
                 relationship_status="cold", verification_status="unverified")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_outreach_contacts").get("ws_seo", "oc_1")
        assert got["data"]["email"] == "editor@partner.com"
        assert got["data"]["relationship_status"] == "cold"

    def test_outreach_suppression_email_preserved(self, tmp_path, dest):
        """Suppression email (unique idempotency field) preserved."""
        _seed(tmp_path, "seo_outreach_suppression", [
            _row("sup_1", email="bounce@bad.com", domain="bad.com",
                 reason="bounce")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_outreach_suppression").get("ws_seo", "sup_1")
        assert got["data"]["email"] == "bounce@bad.com"
        assert got["data"]["reason"] == "bounce"

    def test_campaign_status_enum_preserved(self, tmp_path, dest):
        """Campaign status enum preserved."""
        _seed(tmp_path, "seo_outreach_campaigns", [
            _row("camp_1", site_id="site_abc", status="active",
                 campaign_type="link_gap")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_outreach_campaigns").get("ws_seo", "camp_1")
        assert got["data"]["status"] == "active"
        assert got["data"]["campaign_type"] == "link_gap"

    def test_followup_scheduled_for_preserved(self, tmp_path, dest):
        """Followup scheduled_for (next-run equivalent) preserved."""
        _seed(tmp_path, "seo_outreach_followups", [
            _row("fup_1", campaign_id="camp_1", contact_id="oc_1",
                 status="scheduled", scheduled_for="2026-08-01T09:00:00Z")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_outreach_followups").get("ws_seo", "fup_1")
        assert got["data"]["scheduled_for"] == "2026-08-01T09:00:00Z"
        assert got["data"]["status"] == "scheduled"


# ===========================================================================
# Group 6 — seo_generated_reports (financial-ref: byte_size, sha256)
# (20260802_seo_reports.sql)
# ===========================================================================

class TestGeneratedReportTable:
    def test_report_financial_refs_preserved(self, tmp_path, dest):
        """byte_size and sha256 (integrity / financial-ref fields) preserved exactly."""
        digest = "a" * 64  # 64-char hex
        _seed(tmp_path, "seo_generated_reports", [
            _row("rptmeta_1", site_id="site_abc", kind="full",
                 date_from="2026-07-01", date_to="2026-07-31",
                 byte_size=204800, sha256=digest, status="ready",
                 expires_at="2026-08-01T12:00:00Z")
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_generated_reports").get("ws_seo", "rptmeta_1")
        assert got["data"]["byte_size"] == 204800
        assert got["data"]["sha256"] == digest
        assert got["data"]["status"] == "ready"
        assert got["data"]["expires_at"] == "2026-08-01T12:00:00Z"

    def test_report_id_tenant_timestamps_envelope(self, tmp_path, dest):
        """id/tenant/timestamps preserved for seo_generated_reports."""
        _seed(tmp_path, "seo_generated_reports", [
            _row("rptmeta_2", site_id="site_abc", kind="summary",
                 date_from="2026-07-01", date_to="2026-07-15",
                 byte_size=51200, sha256="b" * 64)
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got = dest("seo_generated_reports").get("ws_seo", "rptmeta_2")
        assert got["id"] == "rptmeta_2"
        assert got["tenant_id"] == "ws_seo"
        assert got["created_at"] == "2026-07-28T10:00:00Z"
        assert got["updated_at"] == "2026-07-28T11:00:00Z"


# ===========================================================================
# Cross-cutting: duplicate / conflict / dry-run / partial / rerun / summary
# ===========================================================================

class TestImportBehaviour:
    def test_dry_run_writes_nothing_and_counts_correctly(self, tmp_path, dest):
        """Dry-run: counts are correct, but nothing is written."""
        _seed(tmp_path, "seo_sites", [
            _row("site_1", domain="a.com"),
            _row("site_2", domain="b.com"),
        ])
        s = migrate(tmp_path, dry_run=True, dest_table_factory=dest)
        t = s["tables"]["seo_sites"]
        assert t["found"] == 2
        assert t["new"] == 2
        assert t["migrated"] == 0  # dry-run: nothing written
        assert dest("seo_sites").get("ws_seo", "site_1") is None

    def test_skip_on_conflict_is_idempotent(self, tmp_path, dest):
        """Re-running with on_conflict='skip' skips all existing rows."""
        _seed(tmp_path, "seo_sites", [_row("site_1", domain="a.com")])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        s2 = migrate(tmp_path, dry_run=False, on_conflict="skip", dest_table_factory=dest)
        t = s2["tables"]["seo_sites"]
        assert t["existing"] == 1
        assert t["migrated"] == 0

    def test_fail_on_conflict_counts_in_dry_run_no_raise(self, tmp_path, dest):
        """Dry-run with on_conflict='fail': conflicts counted, no exception raised."""
        _seed(tmp_path, "seo_sites", [_row("site_1", domain="a.com")])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        s = migrate(tmp_path, dry_run=True, on_conflict="fail", dest_table_factory=dest)
        assert s["conflicts_total"] == 1

    def test_fail_on_conflict_raises_on_apply(self, tmp_path, dest):
        """Apply with on_conflict='fail': MigrationConflict raised."""
        _seed(tmp_path, "seo_sites", [_row("site_1", domain="a.com")])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        with pytest.raises(MigrationConflict):
            migrate(tmp_path, dry_run=False, on_conflict="fail", dest_table_factory=dest)

    def test_partial_import_only_named_tables(self, tmp_path, dest):
        """--only TABLE imports only the named table and ignores others."""
        _seed(tmp_path, "seo_sites", [_row("site_1")])
        _seed(tmp_path, "seo_crawl_jobs", [_row("crawl_1", site_id="site_1")])
        s = migrate(tmp_path, dry_run=True, only=["seo_crawl_jobs"], dest_table_factory=dest)
        assert "seo_crawl_jobs" in s["tables"]
        assert "seo_sites" not in s["tables"]

    def test_rerun_after_full_import_is_no_op(self, tmp_path, dest):
        """Second full import with skip: all rows skipped, nothing re-migrated."""
        _seed(tmp_path, "seo_issues", [
            _row("issue_1", site_id="site_abc", severity="high"),
            _row("issue_2", site_id="site_abc", severity="medium"),
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        s2 = migrate(tmp_path, dry_run=False, on_conflict="skip", dest_table_factory=dest)
        t = s2["tables"]["seo_issues"]
        assert t["existing"] == 2
        assert t["migrated"] == 0

    def test_summary_keys_present_for_every_table(self, tmp_path, dest):
        """Summary contains found/new/existing/migrated/conflicts for each table."""
        _seed(tmp_path, "seo_sites", [_row("site_1")])
        _seed(tmp_path, "seo_reports", [_row("rpt_1", site_id="site_1", crawl_job_id="c1")])
        s = migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        for tname in ("seo_sites", "seo_reports"):
            assert _summary_keys_ok(s["tables"][tname]), (
                f"Table '{tname}' missing expected summary keys: {s['tables'][tname]}"
            )

    def test_cross_tenant_rows_stay_isolated(self, tmp_path, dest):
        """Rows for different tenants are stored under separate keys."""
        _seed(tmp_path, "seo_sites", [
            {"id": "site_A", "tenant_id": "ws_A",
             "created_at": "2026-07-28T10:00:00Z",
             "updated_at": "2026-07-28T11:00:00Z",
             "data": {"domain": "a.com"}},
            {"id": "site_B", "tenant_id": "ws_B",
             "created_at": "2026-07-28T10:00:00Z",
             "updated_at": "2026-07-28T11:00:00Z",
             "data": {"domain": "b.com"}},
        ])
        migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        got_a = dest("seo_sites").get("ws_A", "site_A")
        got_b = dest("seo_sites").get("ws_B", "site_B")
        assert got_a is not None and got_a["data"]["domain"] == "a.com"
        assert got_b is not None and got_b["data"]["domain"] == "b.com"
        # Cross-tenant isolation: A's row is not retrievable as B's
        assert dest("seo_sites").get("ws_B", "site_A") is None
        assert dest("seo_sites").get("ws_A", "site_B") is None

    def test_summary_print_never_shows_token_values(self, tmp_path, dest, capsys):
        """The importer summary must never print token/credential values from seo tables."""
        sealed = "enc:SUPERSECRET_SHOULD_NOT_APPEAR_IN_OUTPUT"
        _seed(tmp_path, "seo_google_connections", [
            _row("gconn_1",
                 access_token_sealed=sealed,
                 refresh_token_sealed=sealed,
                 kind="gsc", status="connected")
        ])
        # The migrate() function itself only prints via _print_summary (the CLI layer).
        # The library function returns a summary dict — verify the dict doesn't embed tokens.
        s = migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        # No token values in the summary dict keys/values at the top level
        summary_str = json.dumps(s)
        assert sealed not in summary_str, (
            "Sealed token value must not appear in the migration summary dict."
        )
        # Nothing from capsys (migrate() itself doesn't print)
        captured = capsys.readouterr()
        assert sealed not in captured.out

    def test_multiple_seo_tables_in_one_pass(self, tmp_path, dest):
        """Importing multiple SEO tables in a single migrate() call works correctly."""
        tables = {
            "seo_sites":         [_row("site_1", domain="example.com")],
            "seo_crawl_jobs":    [_row("crawl_1", site_id="site_1", status="queued")],
            "seo_issues":        [_row("issue_1", site_id="site_1", severity="low")],
            "seo_opportunities": [_row("opp_1", site_id="site_1", status="open")],
            "seo_backlinks":     [_row("bl_1", site_id="site_1", dedup_key="src::tgt")],
            "seo_outreach_contacts": [_row("oc_1", domain="partner.com", email="ed@partner.com")],
            "seo_generated_reports": [_row("rpt_1", site_id="site_1", kind="full",
                                           byte_size=1024, sha256="c" * 64)],
        }
        for tname, rows in tables.items():
            _seed(tmp_path, tname, rows)
        s = migrate(tmp_path, dry_run=False, dest_table_factory=dest)
        for tname in tables:
            assert tname in s["tables"], f"Table {tname} missing from summary"
            assert s["tables"][tname]["migrated"] == 1, (
                f"Table {tname} should have migrated 1 row, got: {s['tables'][tname]}"
            )
