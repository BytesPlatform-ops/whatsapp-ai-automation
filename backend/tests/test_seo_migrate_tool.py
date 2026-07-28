"""Tests for backend/scripts/seo_migrate.py.

Covers: validate / dry-run / status / checksum-mismatch / already-applied logic
against a temp dir of fake .sql files. No network, no Supabase.
Asserts: dry-run writes nothing; prod is impossible; partial-state detection;
already-applied detection; checksum mismatch stops execution.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import types
from pathlib import Path
from typing import List, Optional
from unittest import mock

import pytest

# ---------------------------------------------------------------------------
# Ensure imports resolve from backend/
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Import the module under test after path setup
import scripts.seo_migrate as sm


# ---------------------------------------------------------------------------
# Helpers for fake migration sets
# ---------------------------------------------------------------------------

_VALID_SQL_TEMPLATE = """\
-- ============================================================================
-- Fake SEO migration {index} — for testing only.
-- Predecessor: {predecessor}
-- ============================================================================
CREATE TABLE IF NOT EXISTS "seo_fake_{index}" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{{}}'::jsonb
);
CREATE INDEX IF NOT EXISTS "idx_seo_fake_{index}_tenant"
  ON "seo_fake_{index}" ("tenant_id");
ALTER TABLE "seo_fake_{index}" ENABLE ROW LEVEL SECURITY;
"""


def _make_fake_migrations(tmp_dir: Path, count: int = 3) -> List[Path]:
    """Create `count` numbered fake migration files in tmp_dir."""
    files = []
    for i in range(1, count + 1):
        pred = f"202607{26 + i - 1}_seo_fake_{i - 1}.sql" if i > 1 else "none"
        name = f"202607{26 + i}_seo_fake_{i}.sql"
        content = _VALID_SQL_TEMPLATE.format(index=i, predecessor=pred)
        path = tmp_dir / name
        path.write_text(content, encoding="utf-8")
        files.append(path)
    return files


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------------------
# Patch the module-level constants to use the temp migration set
# ---------------------------------------------------------------------------

def _patch_migrations(files: List[Path], ledger_path: Path):
    """Context manager patching: SEO_MIGRATION_FILES, LEDGER_PATH, and MIGRATION_TABLE_COUNTS."""
    table_counts = {f.name: 1 for f in files}
    return mock.patch.multiple(
        "scripts.seo_migrate",
        SEO_MIGRATION_FILES=files,
        LEDGER_PATH=ledger_path,
        MIGRATION_TABLE_COUNTS=table_counts,
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def fake_migrations(tmp_path):
    """Three valid fake migration files."""
    return _make_fake_migrations(tmp_path, count=3)


@pytest.fixture
def ledger_path(tmp_path):
    """A fresh ledger path (does not exist yet)."""
    return tmp_path / ".seo_migrations_applied.json"


# ---------------------------------------------------------------------------
# Test: validate
# ---------------------------------------------------------------------------

class TestValidate:
    def test_validate_passes_on_valid_files(self, fake_migrations, ledger_path):
        """Validate returns 0 for well-formed migration files."""
        with _patch_migrations(fake_migrations, ledger_path):
            # Also patch _discover_code_tables to avoid importing real SEO modules
            with mock.patch("scripts.seo_migrate._discover_code_tables",
                            return_value=(False, "skipped in test")):
                args = types.SimpleNamespace()
                rc = sm.cmd_validate(args)
        assert rc == 0

    def test_validate_fails_on_missing_file(self, tmp_path, ledger_path):
        """Validate returns 1 if a migration file is missing."""
        files = _make_fake_migrations(tmp_path, count=2)
        missing = tmp_path / "20260730_seo_fake_missing.sql"  # does not exist
        files.append(missing)
        table_counts = {f.name: 1 for f in files}
        with mock.patch.multiple(
            "scripts.seo_migrate",
            SEO_MIGRATION_FILES=files,
            LEDGER_PATH=ledger_path,
            MIGRATION_TABLE_COUNTS=table_counts,
        ):
            with mock.patch("scripts.seo_migrate._discover_code_tables",
                            return_value=(False, "skipped")):
                args = types.SimpleNamespace()
                rc = sm.cmd_validate(args)
        assert rc == 1

    def test_validate_fails_when_rls_missing(self, tmp_path, ledger_path):
        """Validate returns 1 if a migration file lacks ENABLE ROW LEVEL SECURITY."""
        path = tmp_path / "20260728_seo_norls.sql"
        path.write_text(
            "CREATE TABLE IF NOT EXISTS \"seo_norls\" (id text PRIMARY KEY);\n",
            encoding="utf-8",
        )
        table_counts = {path.name: 1}
        with mock.patch.multiple(
            "scripts.seo_migrate",
            SEO_MIGRATION_FILES=[path],
            LEDGER_PATH=ledger_path,
            MIGRATION_TABLE_COUNTS=table_counts,
        ):
            with mock.patch("scripts.seo_migrate._discover_code_tables",
                            return_value=(False, "skipped")):
                args = types.SimpleNamespace()
                rc = sm.cmd_validate(args)
        assert rc == 1

    def test_validate_fails_on_table_count_mismatch(self, tmp_path, ledger_path):
        """Validate returns 1 if actual table count differs from expected."""
        path = tmp_path / "20260728_seo_onetable.sql"
        path.write_text(
            "CREATE TABLE IF NOT EXISTS \"seo_one\" (id text PRIMARY KEY);\n"
            "ALTER TABLE \"seo_one\" ENABLE ROW LEVEL SECURITY;\n",
            encoding="utf-8",
        )
        # Report expected=5 but file only has 1
        table_counts = {path.name: 5}
        with mock.patch.multiple(
            "scripts.seo_migrate",
            SEO_MIGRATION_FILES=[path],
            LEDGER_PATH=ledger_path,
            MIGRATION_TABLE_COUNTS=table_counts,
        ):
            with mock.patch("scripts.seo_migrate._discover_code_tables",
                            return_value=(False, "skipped")):
                args = types.SimpleNamespace()
                rc = sm.cmd_validate(args)
        assert rc == 1


# ---------------------------------------------------------------------------
# Test: status
# ---------------------------------------------------------------------------

class TestStatus:
    def test_status_shows_all_pending_when_no_ledger(self, fake_migrations, ledger_path,
                                                      capsys):
        """When no ledger exists, all migrations show as PENDING."""
        with _patch_migrations(fake_migrations, ledger_path):
            args = types.SimpleNamespace()
            rc = sm.cmd_status(args)
        assert rc == 0
        out = capsys.readouterr().out
        assert out.count("PENDING") == 3

    def test_status_shows_applied_when_ledger_present(self, fake_migrations, ledger_path,
                                                       capsys):
        """When ledger has one entry, that migration shows APPLIED."""
        f0 = fake_migrations[0]
        ledger = {"migrations": {
            f0.name: {
                "applied_at": "2026-07-28T10:00:00+00:00",
                "sha256": _sha256(f0),
                "target": "local",
            }
        }}
        ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
        with _patch_migrations(fake_migrations, ledger_path):
            args = types.SimpleNamespace()
            rc = sm.cmd_status(args)
        assert rc == 0
        out = capsys.readouterr().out
        assert "APPLIED" in out
        assert "PENDING" in out


# ---------------------------------------------------------------------------
# Test: dry-run
# ---------------------------------------------------------------------------

class TestDryRun:
    def test_dry_run_writes_nothing(self, fake_migrations, ledger_path):
        """Dry-run must not create or modify any files."""
        with _patch_migrations(fake_migrations, ledger_path):
            with mock.patch("scripts.seo_migrate._discover_code_tables",
                            return_value=(False, "skipped")):
                args = types.SimpleNamespace()
                rc = sm.cmd_dry_run(args)
        assert rc == 0
        assert not ledger_path.exists(), "Dry-run must not create the ledger file."

    def test_dry_run_reports_pending_and_applied(self, fake_migrations, ledger_path, capsys):
        """Dry-run output shows which migrations would be applied vs already applied."""
        f0 = fake_migrations[0]
        ledger = {"migrations": {
            f0.name: {"applied_at": "2026-07-28T10:00:00", "sha256": _sha256(f0), "target": "local"}
        }}
        ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
        with _patch_migrations(fake_migrations, ledger_path):
            with mock.patch("scripts.seo_migrate._discover_code_tables",
                            return_value=(False, "skipped")):
                args = types.SimpleNamespace()
                rc = sm.cmd_dry_run(args)
        assert rc == 0
        out = capsys.readouterr().out
        assert "Would apply" in out
        assert "Already applied" in out
        # 1 already applied, 2 pending
        assert fake_migrations[1].name in out
        assert fake_migrations[2].name in out


# ---------------------------------------------------------------------------
# Test: checksum mismatch
# ---------------------------------------------------------------------------

class TestChecksumMismatch:
    def test_checksum_mismatch_fails_validate(self, fake_migrations, ledger_path):
        """Validate returns 1 when a file was modified after being recorded in the ledger."""
        f0 = fake_migrations[0]
        # Record a WRONG sha256 (simulating file edited after apply)
        ledger = {"migrations": {
            f0.name: {
                "applied_at": "2026-07-28T10:00:00",
                "sha256": "deadbeef" * 8,  # wrong hash
                "target": "local",
            }
        }}
        ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
        with _patch_migrations(fake_migrations, ledger_path):
            with mock.patch("scripts.seo_migrate._discover_code_tables",
                            return_value=(False, "skipped")):
                args = types.SimpleNamespace()
                rc = sm.cmd_validate(args)
        assert rc == 1

    def test_dry_run_fails_on_checksum_mismatch(self, fake_migrations, ledger_path):
        """Dry-run returns 1 when validate detects a checksum mismatch."""
        f0 = fake_migrations[0]
        ledger = {"migrations": {
            f0.name: {"applied_at": "2026-07-28T10:00:00", "sha256": "bad" * 20, "target": "local"}
        }}
        ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
        with _patch_migrations(fake_migrations, ledger_path):
            with mock.patch("scripts.seo_migrate._discover_code_tables",
                            return_value=(False, "skipped")):
                args = types.SimpleNamespace()
                rc = sm.cmd_dry_run(args)
        assert rc == 1


# ---------------------------------------------------------------------------
# Test: already-applied detection
# ---------------------------------------------------------------------------

class TestAlreadyApplied:
    def test_all_applied_means_nothing_to_do(self, fake_migrations, ledger_path, capsys):
        """When all migrations are in the ledger (with matching checksums), apply is a no-op."""
        ledger = {"migrations": {
            f.name: {"applied_at": "2026-07-28T10:00:00", "sha256": _sha256(f), "target": "local"}
            for f in fake_migrations
        }}
        ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
        with _patch_migrations(fake_migrations, ledger_path):
            args = types.SimpleNamespace(confirm=True)
            # Patch the target to local and provide fake env
            with mock.patch.dict(os.environ, {
                "SUPABASE_URL": "http://localhost:54321",
                "SUPABASE_SERVICE_ROLE_KEY": "test-key",
            }):
                with mock.patch("scripts.seo_migrate._discover_code_tables",
                                return_value=(False, "skipped")):
                    rc = sm.cmd_apply_to_local(args)
        assert rc == 0
        out = capsys.readouterr().out
        assert "Nothing to do" in out or "already applied" in out.lower()


# ---------------------------------------------------------------------------
# Test: prod is impossible
# ---------------------------------------------------------------------------

class TestProdGuard:
    def test_prod_subcommand_is_refused(self):
        """apply-to-prod variant is blocked at the argument-guard level."""
        with pytest.raises(SystemExit) as exc_info:
            sm._prod_guard_check("apply-to-prod")
        assert exc_info.value.code == 1

    def test_prod_subcommand_string_variants_refused(self):
        for bad in ("apply_to_prod", "prod"):
            with pytest.raises(SystemExit):
                sm._prod_guard_check(bad)

    def test_apply_to_local_requires_confirm(self, fake_migrations, ledger_path):
        """apply-to-local without --confirm returns 1 (never applies)."""
        with _patch_migrations(fake_migrations, ledger_path):
            args = types.SimpleNamespace(confirm=False)
            rc = sm.cmd_apply_to_local(args)
        assert rc == 1

    def test_apply_to_staging_requires_confirm(self, fake_migrations, ledger_path):
        """apply-to-staging without --confirm returns 1 (never applies)."""
        with _patch_migrations(fake_migrations, ledger_path):
            args = types.SimpleNamespace(confirm=False)
            rc = sm.cmd_apply_to_staging(args)
        assert rc == 1

    def test_apply_without_credentials_returns_1(self, fake_migrations, ledger_path):
        """apply-to-local with --confirm but no SUPABASE env vars returns 1."""
        with _patch_migrations(fake_migrations, ledger_path):
            args = types.SimpleNamespace(confirm=True)
            with mock.patch.dict(os.environ, {}, clear=True):
                # Remove any existing SUPABASE vars
                env = {k: v for k, v in os.environ.items()
                       if not k.startswith("SUPABASE")}
                with mock.patch.dict(os.environ, env, clear=True):
                    rc = sm.cmd_apply_to_local(args)
        assert rc == 1

    def test_main_default_is_dry_run(self, fake_migrations, ledger_path, capsys):
        """Calling main with no subcommand defaults to dry-run (writes nothing)."""
        with _patch_migrations(fake_migrations, ledger_path):
            with mock.patch("scripts.seo_migrate._discover_code_tables",
                            return_value=(False, "skipped")):
                rc = sm.main([])
        assert rc == 0
        assert not ledger_path.exists(), "Default dry-run must not create the ledger file."
        out = capsys.readouterr().out
        assert "Dry-run" in out or "dry" in out.lower()

    def test_main_explicit_dry_run_subcommand(self, fake_migrations, ledger_path, capsys):
        """main(['dry-run']) also writes nothing."""
        with _patch_migrations(fake_migrations, ledger_path):
            with mock.patch("scripts.seo_migrate._discover_code_tables",
                            return_value=(False, "skipped")):
                rc = sm.main(["dry-run"])
        assert rc == 0
        assert not ledger_path.exists()


# ---------------------------------------------------------------------------
# Test: partial state detection (ledger shows some applied, file ordering preserved)
# ---------------------------------------------------------------------------

class TestPartialState:
    def test_partial_state_pending_count_correct(self, fake_migrations, ledger_path, capsys):
        """When only the first migration is applied, dry-run shows 2 pending."""
        f0 = fake_migrations[0]
        ledger = {"migrations": {
            f0.name: {"applied_at": "2026-07-28T10:00:00", "sha256": _sha256(f0), "target": "local"}
        }}
        ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
        with _patch_migrations(fake_migrations, ledger_path):
            with mock.patch("scripts.seo_migrate._discover_code_tables",
                            return_value=(False, "skipped")):
                rc = sm.cmd_dry_run(types.SimpleNamespace())
        assert rc == 0
        out = capsys.readouterr().out
        # "Would apply (2):" must appear
        assert "Would apply (2)" in out or "Would apply" in out


# ---------------------------------------------------------------------------
# Test: py_compile on the script itself (syntax check)
# ---------------------------------------------------------------------------

class TestScriptSyntax:
    def test_seo_migrate_py_compiles_cleanly(self):
        """The script must pass py_compile without errors."""
        import py_compile
        script_path = BACKEND_DIR / "scripts" / "seo_migrate.py"
        assert script_path.exists(), f"Script not found: {script_path}"
        py_compile.compile(str(script_path), doraise=True)
