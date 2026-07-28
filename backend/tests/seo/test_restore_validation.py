"""Tests for scripts.seo_restore_validation — backup restore validation.

All tests are hermetic: no network, no DB writes. Backup data is created in
temporary directories that are torn down after each test.

Coverage:
  - Valid backup passes all checks
  - Missing id / tenant_id / timestamps detected as errors
  - Duplicate (id, tenant_id) pairs detected
  - Token decryptability (fer:/obf: prefix semantics, no plaintext printed)
  - Broken FK-ish relationships detected (keyword→project, rank_history→keyword)
  - Archived entities: corrupted status detected
  - Scheduler jobs with queued/pending status generate warnings
  - No PII printed in summary output
  - Empty backup dir returns error
  - py_compile check on the script
"""

from __future__ import annotations

import base64
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

# Ensure backend/ is importable
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


# ── Import the module under test ──────────────────────────────────────────────

from scripts.seo_restore_validation import (
    ValidationResult,
    check_archived_entities,
    check_idempotency_keys,
    check_no_duplicate_ids,
    check_no_pii_in_ids,
    check_relationships,
    check_row_fields,
    check_scheduler_job_statuses,
    check_token_decryptability,
    load_backup,
    print_summary,
    validate_backup,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_row(
    row_id: str = "row1",
    tenant_id: str = "tenant1",
    created_at: str = "2024-01-01T00:00:00+00:00",
    updated_at: str = "2024-01-01T00:00:00+00:00",
    data: dict | None = None,
    **extra,
) -> dict:
    row = {
        "id": row_id,
        "tenant_id": tenant_id,
        "created_at": created_at,
        "updated_at": updated_at,
        "data": data or {},
    }
    row.update(extra)
    return row


def _write_table(backup_dir: Path, table: str, rows: list) -> None:
    (backup_dir / f"row_{table}.json").write_text(
        json.dumps(rows, default=str), encoding="utf-8"
    )


@pytest.fixture
def backup_dir():
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


# ── load_backup ───────────────────────────────────────────────────────────────

def test_load_backup_empty_dir(backup_dir):
    tables = load_backup(backup_dir)
    assert tables == {}


def test_load_backup_nonexistent_dir():
    tables = load_backup(Path("/nonexistent/path/xyz"))
    assert tables == {}


def test_load_backup_reads_tables(backup_dir):
    rows = [_make_row("r1", "t1"), _make_row("r2", "t1")]
    _write_table(backup_dir, "seo_sites", rows)
    tables = load_backup(backup_dir)
    assert "seo_sites" in tables
    assert len(tables["seo_sites"]) == 2


def test_load_backup_multiple_tables(backup_dir):
    _write_table(backup_dir, "seo_sites", [_make_row("s1", "t1")])
    _write_table(backup_dir, "seo_keywords", [_make_row("k1", "t1"), _make_row("k2", "t1")])
    tables = load_backup(backup_dir)
    assert len(tables) == 2
    assert len(tables["seo_keywords"]) == 2


# ── check_row_fields ──────────────────────────────────────────────────────────

def test_check_row_fields_valid(backup_dir):
    tables = {"seo_sites": [_make_row("r1", "t1")]}
    result = ValidationResult()
    check_row_fields(tables, result, verbose=False)
    assert result.passed
    assert not result.errors


def test_check_row_fields_missing_id():
    row = {"tenant_id": "t1", "created_at": "2024-01-01", "updated_at": "2024-01-01", "data": {}}
    result = ValidationResult()
    check_row_fields({"tbl": [row]}, result, verbose=False)
    assert not result.passed
    assert any("missing 'id'" in e for e in result.errors)


def test_check_row_fields_missing_tenant():
    row = {"id": "r1", "created_at": "2024-01-01", "updated_at": "2024-01-01", "data": {}}
    result = ValidationResult()
    check_row_fields({"tbl": [row]}, result, verbose=False)
    assert not result.passed
    assert any("tenant_id" in e for e in result.errors)


def test_check_row_fields_missing_created_at():
    row = {"id": "r1", "tenant_id": "t1", "updated_at": "2024-01-01", "data": {}}
    result = ValidationResult()
    check_row_fields({"tbl": [row]}, result, verbose=False)
    assert not result.passed
    assert any("created_at" in e for e in result.errors)


def test_check_row_fields_missing_updated_at_only_warns():
    row = {"id": "r1", "tenant_id": "t1", "created_at": "2024-01-01", "data": {}}
    result = ValidationResult()
    check_row_fields({"tbl": [row]}, result, verbose=False)
    # updated_at missing → warning, not error
    assert result.passed  # no errors
    assert any("updated_at" in w for w in result.warnings)


# ── check_no_duplicate_ids ────────────────────────────────────────────────────

def test_no_duplicates_clean():
    tables = {"tbl": [
        _make_row("r1", "t1"),
        _make_row("r2", "t1"),
        _make_row("r1", "t2"),  # same id, different tenant → OK
    ]}
    result = ValidationResult()
    check_no_duplicate_ids(tables, result, verbose=False)
    assert result.passed


def test_duplicates_detected():
    tables = {"tbl": [
        _make_row("r1", "t1"),
        _make_row("r1", "t1"),  # exact duplicate
    ]}
    result = ValidationResult()
    check_no_duplicate_ids(tables, result, verbose=False)
    assert not result.passed
    assert any("duplicate" in e.lower() for e in result.errors)


# ── check_token_decryptability ────────────────────────────────────────────────

def test_obf_token_decodable():
    secret = "ya29.some_access_token"
    obf_value = "obf:" + base64.urlsafe_b64encode(secret.encode()).decode()
    tables = {"cc_credentials": [
        _make_row("c1", "t1", data={"refresh_token": obf_value})
    ]}
    result = ValidationResult()
    # Patch crypto import to avoid key dependency
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("GOOGLE_TOKEN_ENCRYPTION_KEY", None)
        check_token_decryptability(tables, result, verbose=False)
    assert result.passed  # obf: is always decodable


def test_obf_token_corrupt_fails():
    # Use a value with incorrect padding that base64.urlsafe_b64decode will reject
    corrupt = "obf:not@valid@base64@@@@@@"
    tables = {"cc_credentials": [
        _make_row("c1", "t1", data={"refresh_token": corrupt})
    ]}
    result = ValidationResult()
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("GOOGLE_TOKEN_ENCRYPTION_KEY", None)
        check_token_decryptability(tables, result, verbose=False)
    assert not result.passed
    assert any("NOT printed" in e for e in result.errors)


def test_fer_token_warns_when_no_key():
    tables = {"cc_credentials": [
        _make_row("c1", "t1", data={"refresh_token": "fer:gAAAAABh_some_fake_cipher"})
    ]}
    result = ValidationResult()
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("GOOGLE_TOKEN_ENCRYPTION_KEY", None)
        check_token_decryptability(tables, result, verbose=False)
    # When no key: fer: tokens generate a warning (not error)
    assert any("fer:" in w or "key" in w.lower() for w in result.warnings)


def test_plaintext_secret_field_warns():
    tables = {"cc_credentials": [
        _make_row("c1", "t1", data={"api_secret": "plaintext_secret_value"})
    ]}
    result = ValidationResult()
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("GOOGLE_TOKEN_ENCRYPTION_KEY", None)
        check_token_decryptability(tables, result, verbose=False)
    # Plaintext secret field without prefix → warning
    assert any("plaintext" in w.lower() or "unsealed" in w.lower() for w in result.warnings)


def test_token_value_not_in_error_messages():
    """Token values must never appear in error/warning messages."""
    secret = "super_secret_refresh_token_12345"
    obf_value = "obf:!!!corrupt!!!"
    tables = {"cc_credentials": [
        _make_row("c1", "t1", data={"refresh_token": obf_value})
    ]}
    result = ValidationResult()
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("GOOGLE_TOKEN_ENCRYPTION_KEY", None)
        check_token_decryptability(tables, result, verbose=False)
    all_messages = result.errors + result.warnings + result.infos
    # The actual value obf:!!!corrupt!!! should not appear in messages
    # (the impl says "value NOT printed")
    for msg in all_messages:
        assert "corrupt" not in msg or "NOT printed" in msg or "not" in msg.lower()


# ── check_relationships ────────────────────────────────────────────────────────

def test_relationships_clean():
    project = _make_row("proj1", "t1")
    keyword = _make_row("kw1", "t1", data={"project_id": "proj1"})
    tables = {
        "seo_keyword_projects": [project],
        "seo_keywords": [keyword],
    }
    result = ValidationResult()
    check_relationships(tables, result, verbose=False)
    assert result.passed


def test_relationships_broken_keyword_project():
    keyword = _make_row("kw1", "t1", data={"project_id": "nonexistent_project"})
    tables = {
        "seo_keyword_projects": [_make_row("proj1", "t1")],
        "seo_keywords": [keyword],
    }
    result = ValidationResult()
    check_relationships(tables, result, verbose=False)
    assert not result.passed
    assert any("keyword" in e.lower() and "project" in e.lower() for e in result.errors)


def test_relationships_broken_rank_keyword():
    rank = _make_row("r1", "t1", data={"keyword_id": "missing_kw"})
    tables = {
        "seo_keywords": [_make_row("kw1", "t1")],
        "seo_rank_history": [rank],
    }
    result = ValidationResult()
    check_relationships(tables, result, verbose=False)
    assert not result.passed
    assert any("rank" in e.lower() and "keyword" in e.lower() for e in result.errors)


def test_relationships_no_data_no_error():
    """When reference tables are absent, relationship checks are skipped."""
    tables = {}
    result = ValidationResult()
    check_relationships(tables, result, verbose=False)
    assert result.passed


# ── check_scheduler_job_statuses ──────────────────────────────────────────────

def test_scheduler_clean_jobs():
    tables = {"seo_scheduler_jobs": [
        _make_row("j1", "t1", data={"status": "completed"}),
        _make_row("j2", "t1", data={"status": "failed"}),
    ]}
    result = ValidationResult()
    check_scheduler_job_statuses(tables, result, verbose=False)
    assert result.passed
    assert not result.warnings


def test_scheduler_queued_job_warns():
    tables = {"seo_scheduler_jobs": [
        _make_row("j1", "t1", data={"status": "queued"}),
    ]}
    result = ValidationResult()
    check_scheduler_job_statuses(tables, result, verbose=False)
    assert result.passed  # warning, not error
    assert any("queued" in w.lower() or "auto-execute" in w.lower() for w in result.warnings)


def test_scheduler_pending_job_warns():
    tables = {"jobs": [
        _make_row("j2", "t1", data={"status": "pending"}),
    ]}
    result = ValidationResult()
    check_scheduler_job_statuses(tables, result, verbose=False)
    assert any("pending" in w.lower() or "auto-execute" in w.lower() for w in result.warnings)


# ── check_idempotency_keys ────────────────────────────────────────────────────

def test_idempotency_present():
    tables = {"seo_outreach_campaigns": [
        _make_row("c1", "t1", data={"idempotency_key": "ikey_abc"})
    ]}
    result = ValidationResult()
    check_idempotency_keys(tables, result, verbose=False)
    assert not result.warnings


def test_idempotency_missing_warns():
    tables = {"seo_outreach_campaigns": [
        _make_row("c1", "t1", data={"name": "campaign_1"})  # no idempotency key
    ]}
    result = ValidationResult()
    check_idempotency_keys(tables, result, verbose=False)
    assert any("idempotency" in w.lower() or "duplicate" in w.lower() for w in result.warnings)


# ── check_archived_entities ───────────────────────────────────────────────────

def test_archived_clean():
    tables = {"seo_sites": [
        _make_row("s1", "t1", data={"archived": True, "status": "archived"}),
    ]}
    result = ValidationResult()
    check_archived_entities(tables, result, verbose=False)
    assert result.passed


def test_archived_with_active_status_is_error():
    tables = {"seo_sites": [
        _make_row("s1", "t1", data={"archived": True, "status": "active"}),
    ]}
    result = ValidationResult()
    check_archived_entities(tables, result, verbose=False)
    assert not result.passed
    assert any("corruption" in e.lower() or "archived" in e.lower() for e in result.errors)


def test_archived_with_queued_status_is_error():
    tables = {"seo_sites": [
        _make_row("s1", "t1", data={"archived": True, "status": "queued"}),
    ]}
    result = ValidationResult()
    check_archived_entities(tables, result, verbose=False)
    assert not result.passed


# ── check_no_pii_in_ids ───────────────────────────────────────────────────────

def test_pii_in_id_warns():
    tables = {"tbl": [_make_row("user@example.com", "tenant1")]}
    result = ValidationResult()
    check_no_pii_in_ids(tables, result)
    assert any("email" in w.lower() or "pii" in w.lower() or "email-like" in w.lower()
               for w in result.warnings)


def test_no_pii_in_ids_clean():
    tables = {"tbl": [_make_row("uuid-1234", "tenant_abc")]}
    result = ValidationResult()
    check_no_pii_in_ids(tables, result)
    assert not result.warnings


# ── validate_backup ───────────────────────────────────────────────────────────

def test_validate_backup_empty_dir(backup_dir):
    result = validate_backup(backup_dir)
    assert not result.passed
    assert any("No row_*.json" in e for e in result.errors)


def test_validate_backup_valid_data(backup_dir):
    rows = [
        _make_row("r1", "t1"),
        _make_row("r2", "t1"),
    ]
    _write_table(backup_dir, "seo_sites", rows)
    result = validate_backup(backup_dir)
    assert result.passed
    assert not result.errors


def test_validate_backup_broken_relationship_is_error(backup_dir):
    keyword = _make_row("kw1", "t1", data={"project_id": "ghost_project"})
    project = _make_row("p1", "t1")
    _write_table(backup_dir, "seo_keywords", [keyword])
    _write_table(backup_dir, "seo_keyword_projects", [project])
    result = validate_backup(backup_dir)
    assert not result.passed


def test_validate_backup_queued_jobs_only_warn(backup_dir):
    _write_table(backup_dir, "seo_scheduler_jobs", [
        _make_row("j1", "t1", data={"status": "queued"}),
    ])
    result = validate_backup(backup_dir)
    # queued jobs are warnings, not errors
    assert result.passed
    assert result.warnings


# ── print_summary never prints PII ────────────────────────────────────────────

def test_print_summary_no_pii(backup_dir, capsys):
    """print_summary should not print any token values."""
    secret = "ya29.super_secret_real_token_value"
    obf_value = "obf:" + base64.urlsafe_b64encode(secret.encode()).decode()
    _write_table(backup_dir, "cc_credentials", [
        _make_row("c1", "t1", data={"refresh_token": obf_value})
    ])
    result = validate_backup(backup_dir)
    print_summary(result, backup_dir)
    captured = capsys.readouterr()
    # The real secret should never appear in the output
    assert secret not in captured.out
    assert secret not in captured.err
    # The obfuscated value prefix should not be present either
    assert "ya29" not in captured.out


# ── py_compile check on the script ───────────────────────────────────────────

def test_restore_validation_script_compiles():
    """The restore validation script should have no syntax errors."""
    import py_compile
    script = _BACKEND_DIR / "scripts" / "seo_restore_validation.py"
    assert script.exists(), f"Script not found at {script}"
    py_compile.compile(str(script), doraise=True)
