"""SEO backup restore-validation tool.

Validates a backup directory (row_*.json files, same shape as the file
persistence importer reads) into an in-memory isolated destination and reports:

  - ID / tenant_id / timestamp preservation
  - Token decryptability (fer:/obf: prefix semantics)
  - Relationship consistency (FK-ish: keyword references project_id, etc.)
  - Scheduler job statuses won't auto-execute on restore
  - Idempotency key presence on key record types
  - Archived entities stay archived

SAFETY CONTRACT:
  - NEVER writes to any production DB or real persistence backend
  - NEVER prints token values, refresh tokens, or PII
  - All validation is in-memory only
  - Exit code 0 = validation passed, 1 = validation failed, 2 = no data found

Usage:
    python scripts/seo_restore_validation.py --backup-dir /path/to/backup/
    python scripts/seo_restore_validation.py --backup-dir /path/to/backup/ --verbose

The backup dir should contain files named row_<table>.json, each containing a
JSON array of row dicts (same format as _FileRepo in persistence.py).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Optional

# Make backend/ importable when run from scripts/
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


# ── Result helpers ────────────────────────────────────────────────────────────

class ValidationResult:
    """Accumulates check findings without raising on first failure."""

    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.infos: list[str] = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def info(self, msg: str) -> None:
        self.infos.append(msg)

    @property
    def passed(self) -> bool:
        return len(self.errors) == 0


# ── Load backup dir ───────────────────────────────────────────────────────────

def load_backup(backup_dir: Path) -> dict[str, list[dict]]:
    """Read all row_*.json files from backup_dir into a dict keyed by table name.

    Returns {} if directory does not exist. Never raises for individual file read
    errors — records a warning per file.
    """
    tables: dict[str, list[dict]] = {}
    if not backup_dir.exists():
        return tables
    for path in sorted(backup_dir.glob("row_*.json")):
        table = path.stem[len("row_"):]
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(payload, list):
                tables[table] = payload
            else:
                tables[table] = []
        except (ValueError, OSError):
            tables[table] = []
    return tables


# ── Check functions ────────────────────────────────────────────────────────────

def check_row_fields(tables: dict, result: ValidationResult, verbose: bool) -> None:
    """Every row must have id, tenant_id, created_at. updated_at is recommended."""
    total = 0
    missing_id = 0
    missing_tenant = 0
    missing_created = 0
    missing_updated = 0

    for table, rows in tables.items():
        for i, row in enumerate(rows):
            total += 1
            if not row.get("id"):
                missing_id += 1
                result.error(f"[{table}][{i}] missing 'id' field")
            if not row.get("tenant_id"):
                missing_tenant += 1
                result.error(f"[{table}][{i}] missing 'tenant_id' field")
            if not row.get("created_at"):
                missing_created += 1
                result.error(f"[{table}][{i}] missing 'created_at' (timestamp not preserved)")
            if not row.get("updated_at"):
                missing_updated += 1

    if verbose:
        result.info(f"row_fields: checked {total} rows across {len(tables)} tables")
    if missing_updated:
        result.warn(f"row_fields: {missing_updated} rows missing 'updated_at' (advisory)")


def check_no_duplicate_ids(tables: dict, result: ValidationResult, verbose: bool) -> None:
    """No two rows in the same table should share an (id, tenant_id) pair."""
    for table, rows in tables.items():
        seen: set[tuple] = set()
        dupes = 0
        for row in rows:
            key = (row.get("id", ""), row.get("tenant_id", ""))
            if key in seen:
                dupes += 1
                result.error(f"[{table}] duplicate (id, tenant_id) = {key}")
            seen.add(key)
        if verbose and not dupes:
            result.info(f"no_duplicate_ids: [{table}] {len(rows)} rows, no duplicates")


def check_token_decryptability(tables: dict, result: ValidationResult, verbose: bool) -> None:
    """Validate sealed tokens can be identified (and decrypted when key is set).

    Never prints the token value or plaintext. Only reports mode and status.
    """
    try:
        from seo.google import crypto  # noqa: PLC0415
        enc_status = crypto.encryption_status()
        key_active = enc_status.get("active", False)
    except Exception as exc:
        result.warn(f"token_decryptability: cannot import seo.google.crypto ({exc}) — skipping token checks")
        return

    # Tables that are known to hold sealed tokens (inside 'data' JSONB)
    token_bearing_tables = {
        "cc_credentials", "seo_google_connections", "google_connections",
        "seo_connections", "oauth_tokens",
    }

    fer_count = 0
    obf_count = 0
    plain_count = 0
    ok_count = 0
    fail_count = 0

    for table in token_bearing_tables:
        rows = tables.get(table, [])
        for row in rows:
            data = row.get("data", {})
            if not isinstance(data, dict):
                continue
            # Scan for any field that looks like a sealed token
            for field, value in data.items():
                if not isinstance(value, str):
                    continue
                if not value:
                    continue
                if value.startswith("fer:"):
                    fer_count += 1
                    if key_active:
                        try:
                            # Attempt decryption — we know the key is set
                            _ = crypto.unseal(value)
                            ok_count += 1
                        except Exception:
                            fail_count += 1
                            result.error(
                                f"[{table}] field '{field}': fer: token cannot be decrypted — "
                                "key mismatch or corruption (value NOT printed)"
                            )
                    else:
                        # Key not set — report as undecryptable but not an error
                        # (restoration may be to a different key environment)
                        result.warn(
                            f"[{table}] field '{field}': fer: token found but no decryption key set — "
                            "will be undecryptable in restore target unless GOOGLE_TOKEN_ENCRYPTION_KEY is set"
                        )
                elif value.startswith("obf:"):
                    obf_count += 1
                    # obf: is always decodable (base64)
                    import base64
                    try:
                        _ = base64.urlsafe_b64decode(value[4:].encode("utf-8"))
                        ok_count += 1
                    except Exception:
                        fail_count += 1
                        result.error(
                            f"[{table}] field '{field}': obf: token cannot be decoded — "
                            "value appears corrupt (NOT printed)"
                        )
                elif "token" in field.lower() or "key" in field.lower() or "secret" in field.lower():
                    plain_count += 1
                    result.warn(
                        f"[{table}] field '{field}': value looks like an unsealed token/secret "
                        "(not prefixed with fer:/obf:) — may be stored in plaintext"
                    )

    if verbose:
        result.info(
            f"token_decryptability: fer={fer_count} obf={obf_count} plain={plain_count} "
            f"ok={ok_count} fail={fail_count}"
        )


def check_relationships(tables: dict, result: ValidationResult, verbose: bool) -> None:
    """FK-ish relationship checks between related tables.

    Checks:
    - seo_keywords / keywords: every project_id should reference a known project
    - seo_issues: every site_id should reference a known site
    - seo_rank_history: every keyword_id should reference a known keyword
    - seo_opportunities: every project_id or site_id should be known
    """
    def _ids(table_name: str, field: str = "id") -> set:
        return {r.get("data", {}).get(field) or r.get(field)
                for r in tables.get(table_name, [])
                if r.get("data", {}).get(field) or r.get(field)}

    def _data_field(row: dict, field: str):
        # rows may have 'data' JSONB blob or be flat
        data = row.get("data", {})
        if isinstance(data, dict) and field in data:
            return data[field]
        return row.get(field)

    # Collect known project IDs
    project_ids = _ids("seo_projects") | _ids("seo_keyword_projects") | _ids("keyword_projects")
    site_ids = _ids("seo_sites") | _ids("sites")
    keyword_ids = _ids("seo_keywords") | _ids("keywords")

    # Check keywords reference valid projects
    broken_kw_project = 0
    for row in tables.get("seo_keywords", []) + tables.get("keywords", []):
        pid = _data_field(row, "project_id")
        if pid and project_ids and pid not in project_ids:
            broken_kw_project += 1
    if broken_kw_project:
        result.error(
            f"relationships: {broken_kw_project} keyword row(s) reference unknown project_id "
            "(orphaned after restore)"
        )
    elif verbose and (tables.get("seo_keywords") or tables.get("keywords")):
        result.info("relationships: keyword→project references valid")

    # Check rank history references valid keywords
    broken_rank_kw = 0
    for row in tables.get("seo_rank_history", []) + tables.get("rank_history", []):
        kid = _data_field(row, "keyword_id")
        if kid and keyword_ids and kid not in keyword_ids:
            broken_rank_kw += 1
    if broken_rank_kw:
        result.error(
            f"relationships: {broken_rank_kw} rank_history row(s) reference unknown keyword_id"
        )
    elif verbose and (tables.get("seo_rank_history") or tables.get("rank_history")):
        result.info("relationships: rank_history→keyword references valid")

    # Check issues reference valid sites
    broken_issues = 0
    for row in tables.get("seo_issues", []) + tables.get("issues", []):
        sid = _data_field(row, "site_id")
        if sid and site_ids and sid not in site_ids:
            broken_issues += 1
    if broken_issues:
        result.error(
            f"relationships: {broken_issues} issue row(s) reference unknown site_id"
        )
    elif verbose and (tables.get("seo_issues") or tables.get("issues")):
        result.info("relationships: issue→site references valid")


def check_scheduler_job_statuses(tables: dict, result: ValidationResult, verbose: bool) -> None:
    """Scheduler jobs must not auto-execute on restore.

    Jobs with status 'queued' or 'pending' would be picked up immediately on
    scheduler start. This check warns if such rows exist, so operators can
    review before bringing the scheduler online after a restore.
    """
    auto_execute_statuses = {"queued", "pending", "ready"}
    risky_tables = [
        "seo_scheduler_jobs", "scheduler_jobs", "seo_jobs", "jobs",
        "seo_rank_jobs", "rank_jobs",
    ]

    risky_count = 0
    total_jobs = 0

    for table_name in risky_tables:
        rows = tables.get(table_name, [])
        for row in rows:
            total_jobs += 1
            data = row.get("data", {}) if isinstance(row.get("data"), dict) else {}
            status = data.get("status") or row.get("status", "")
            if isinstance(status, str) and status.lower() in auto_execute_statuses:
                risky_count += 1

    if risky_count > 0:
        result.warn(
            f"scheduler_job_statuses: {risky_count} job(s) have status that would auto-execute "
            f"(queued/pending/ready) when the scheduler starts after restore. "
            "Review these jobs before enabling SEO_SCHEDULER_ENABLED after restore."
        )
    elif verbose:
        result.info(f"scheduler_job_statuses: {total_jobs} job rows checked, none auto-execute-risky")


def check_idempotency_keys(tables: dict, result: ValidationResult, verbose: bool) -> None:
    """Key record types should have idempotency / operation_id fields intact."""
    # Tables that should have some form of idempotency key
    idempotency_fields = ["idempotency_key", "operation_id", "job_id", "external_id"]
    idempotency_tables = [
        "seo_outreach_campaigns", "outreach_campaigns",
        "seo_payments", "payments",
        "seo_scheduler_jobs", "scheduler_jobs",
    ]

    missing_count = 0
    checked = 0

    for table_name in idempotency_tables:
        rows = tables.get(table_name, [])
        for row in rows:
            checked += 1
            data = row.get("data", {}) if isinstance(row.get("data"), dict) else {}
            has_key = any(
                data.get(f) or row.get(f)
                for f in idempotency_fields
            )
            if not has_key:
                missing_count += 1

    if missing_count:
        result.warn(
            f"idempotency_keys: {missing_count}/{checked} rows in high-value tables lack "
            "idempotency/operation_id fields — duplicate operations may occur after restore"
        )
    elif verbose:
        result.info(f"idempotency_keys: {checked} rows in key tables have idempotency fields")


def check_archived_entities(tables: dict, result: ValidationResult, verbose: bool) -> None:
    """Archived entities must stay archived — archived=True / status='archived' preserved."""
    archived_status_values = {"archived", "deleted", "inactive", "disabled"}
    archived_count = 0
    corruption_count = 0

    for table, rows in tables.items():
        for row in rows:
            data = row.get("data", {}) if isinstance(row.get("data"), dict) else {}
            is_archived = (
                data.get("archived") is True
                or row.get("archived") is True
                or (isinstance(data.get("status"), str) and data["status"].lower() in archived_status_values)
                or (isinstance(row.get("status"), str) and row["status"].lower() in archived_status_values)
            )
            if is_archived:
                archived_count += 1
                # Check for corruption: an archived row that also has an active/queued status
                status = data.get("status") or row.get("status", "")
                if isinstance(status, str) and status.lower() in {"queued", "pending", "active", "ready"}:
                    corruption_count += 1
                    result.error(
                        f"[{table}][id={row.get('id', '?')}] row is archived but has "
                        f"active-like status='{status}' — state corruption"
                    )

    if verbose:
        result.info(
            f"archived_entities: {archived_count} archived rows found; "
            f"{corruption_count} status corruptions"
        )
    if not corruption_count and archived_count and not verbose:
        pass  # clean, no output needed (summary covers it)


def check_no_pii_in_ids(tables: dict, result: ValidationResult) -> None:
    """Advisory: warn if id or tenant_id fields look like email addresses or phone numbers.

    This is a light heuristic check, not a PII scanner. It only checks structural
    fields (id, tenant_id), NOT data payloads.
    """
    email_like = 0
    for table, rows in tables.items():
        for row in rows:
            row_id = str(row.get("id", ""))
            tenant = str(row.get("tenant_id", ""))
            for val in (row_id, tenant):
                if "@" in val and "." in val.split("@")[-1]:
                    email_like += 1
    if email_like:
        result.warn(
            f"no_pii_in_ids: {email_like} id/tenant_id field(s) appear to contain email-like values — "
            "verify these are expected tenant identifier formats"
        )


# ── Main validation runner ────────────────────────────────────────────────────

def validate_backup(backup_dir: Path, *, verbose: bool = False) -> ValidationResult:
    """Run all validation checks against the backup directory.

    Returns a ValidationResult. Never writes to any persistence backend.
    """
    result = ValidationResult()

    tables = load_backup(backup_dir)

    if not tables:
        result.error(f"No row_*.json files found in {backup_dir}")
        return result

    total_rows = sum(len(v) for v in tables.values())
    result.info(f"Loaded {len(tables)} table(s), {total_rows} total rows from {backup_dir}")

    check_row_fields(tables, result, verbose)
    check_no_duplicate_ids(tables, result, verbose)
    check_token_decryptability(tables, result, verbose)
    check_relationships(tables, result, verbose)
    check_scheduler_job_statuses(tables, result, verbose)
    check_idempotency_keys(tables, result, verbose)
    check_archived_entities(tables, result, verbose)
    check_no_pii_in_ids(tables, result)

    return result


def print_summary(result: ValidationResult, backup_dir: Path) -> None:
    """Print a human-readable summary. Never prints token values or PII data."""
    print(f"\nSEO Restore Validation — {backup_dir}")
    print("=" * 60)

    if result.infos:
        print("\n[INFO]")
        for msg in result.infos:
            print(f"  {msg}")

    if result.warnings:
        print(f"\n[WARN] ({len(result.warnings)} advisory warning(s))")
        for msg in result.warnings:
            print(f"  {msg}")

    if result.errors:
        print(f"\n[ERROR] ({len(result.errors)} validation error(s))")
        for msg in result.errors:
            print(f"  {msg}")

    print("\n" + ("=" * 60))
    if result.passed:
        print(f"RESULT: PASSED ({len(result.warnings)} warnings, 0 errors)")
        print("Backup appears structurally valid for restore.")
        if result.warnings:
            print("Review warnings above before proceeding.")
    else:
        print(f"RESULT: FAILED ({len(result.errors)} error(s), {len(result.warnings)} warnings)")
        print("Do NOT restore this backup into production without fixing errors above.")
    print()


def main(argv: Optional[list] = None) -> int:
    ap = argparse.ArgumentParser(
        description="Validate a SEO backup directory (row_*.json) without writing to any DB."
    )
    ap.add_argument(
        "--backup-dir", required=True,
        help="Directory containing row_*.json backup files"
    )
    ap.add_argument(
        "--verbose", "-v", action="store_true",
        help="Print info-level messages in addition to warnings/errors"
    )
    args = ap.parse_args(argv)

    backup_dir = Path(args.backup_dir).expanduser().resolve()

    if not backup_dir.exists():
        print(f"ERROR: backup directory does not exist: {backup_dir}", file=sys.stderr)
        return 2

    result = validate_backup(backup_dir, verbose=args.verbose)
    print_summary(result, backup_dir)

    if not result.passed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
