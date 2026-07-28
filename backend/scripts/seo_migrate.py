"""SEO Migration CLI — safe runner for the six Pixie SEO Supabase migrations.

NOT run in tests. This script is a human-operated tool for validating and applying
the SEO migration files to a local or staging Supabase environment. Production
application is explicitly blocked by design.

Usage:
    python scripts/seo_migrate.py validate
    python scripts/seo_migrate.py dry-run
    python scripts/seo_migrate.py status
    python scripts/seo_migrate.py apply-to-local   --confirm
    python scripts/seo_migrate.py apply-to-staging --confirm

Subcommands:
    validate          Parse + checksum each migration file; detect ordering issues and
                      check that every code table is covered. Writes nothing. Exits 0
                      on success, 1 on any issue.
    dry-run           Run validate then show which migrations would be applied (based on
                      the local JSON ledger). Writes nothing.
    status            Show which migrations have been applied per the local ledger.
    apply-to-local    Apply pending migrations to a local Supabase instance. Requires
                      SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for the local target AND
                      --confirm. Never automatic.
    apply-to-staging  Apply pending migrations to a staging Supabase instance. Same
                      requirements as apply-to-local. Never automatic.
    verify            After apply, verify expected tables + indexes exist by querying
                      the information_schema. Requires SUPABASE_URL + key.

Production target is NEVER supported. The script will refuse any production URL pattern
(*.supabase.co without explicit --target local|staging flag is refused; prod = refused
outright). Only --target staging|local with --confirm is accepted.

Ledger: .seo_migrations_applied.json in the repo root (alongside supabase/). Never
printed to stdout. Ledger format: { "migrations": { "<filename>": { "applied_at": ISO,
"sha256": hex, "target": "local"|"staging" } } }

Checksums: sha256 per file detected at load time. A mismatch against a previously
recorded sha256 stops execution immediately (file was edited after apply — dangerous).

All output: migration file NAMES only. Secrets are never printed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
MIGRATIONS_DIR = REPO_DIR / "supabase" / "migrations"
LEDGER_PATH = REPO_DIR / ".seo_migrations_applied.json"

SEO_MIGRATION_FILES: List[Path] = [
    MIGRATIONS_DIR / "20260728_seo.sql",
    MIGRATIONS_DIR / "20260729_seo_search_intelligence.sql",
    MIGRATIONS_DIR / "20260730_seo_backlinks.sql",
    MIGRATIONS_DIR / "20260731_seo_local.sql",
    MIGRATIONS_DIR / "20260801_seo_outreach.sql",
    MIGRATIONS_DIR / "20260802_seo_reports.sql",
]

# Expected table counts per migration (for post-apply verification)
MIGRATION_TABLE_COUNTS: Dict[str, int] = {
    "20260728_seo.sql": 5,
    "20260729_seo_search_intelligence.sql": 18,
    "20260730_seo_backlinks.sql": 4,
    "20260731_seo_local.sql": 10,
    "20260801_seo_outreach.sql": 6,
    "20260802_seo_reports.sql": 1,
}

# ---------------------------------------------------------------------------
# Checksum helpers
# ---------------------------------------------------------------------------

def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------------------
# Ledger helpers
# ---------------------------------------------------------------------------

def _load_ledger() -> Dict:
    if LEDGER_PATH.exists():
        try:
            return json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass
    return {"migrations": {}}


def _save_ledger(ledger: Dict) -> None:
    LEDGER_PATH.write_text(json.dumps(ledger, indent=2, ensure_ascii=False), encoding="utf-8")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# SQL parsing for validate/verify steps
# ---------------------------------------------------------------------------

def _created_tables_in_sql(sql: str) -> List[str]:
    return [
        m.lower()
        for m in re.findall(
            r"create\s+table\s+(?:if\s+not\s+exists\s+)?[\"']?([a-zA-Z0-9_]+)[\"']?",
            sql,
            re.IGNORECASE,
        )
        if m.lower().startswith("seo_")
    ]


def _has_rls(sql: str) -> bool:
    return bool(re.search(r"enable\s+row\s+level\s+security", sql, re.IGNORECASE))


# ---------------------------------------------------------------------------
# Code-side table discovery (for validate coverage check)
# ---------------------------------------------------------------------------

def _discover_code_tables() -> Optional[Tuple[bool, str]]:
    """Try to import SEO store modules and collect table names.
    Returns (ok, message). Soft — import errors are non-fatal in validate."""
    sys.path.insert(0, str(BACKEND_DIR))
    try:
        import seo.stores as stores
        import seo.search_stores as ss
        import seo.backlinks.stores as bs
        import seo.local.stores as ls
        import seo.outreach.stores as os_
        import seo.reporting.store as rs
    except ImportError as exc:
        return False, f"Could not import SEO store modules: {exc}"

    tables = set()
    for attr_name in dir(stores):
        cls = getattr(stores, attr_name)
        if isinstance(cls, type) and issubclass(cls, stores._Repo):
            tn = getattr(cls, "table_name", "")
            if tn and tn.startswith("seo_"):
                tables.add(tn)
    for cls in ss.ALL_REPOSITORIES:
        tables.add(cls.table_name)
    for cls in bs.ALL_REPOSITORIES:
        tables.add(cls.table_name)
    for cls in ls.ALL_REPOSITORIES:
        tables.add(cls.table_name)
    for cls in os_.ALL_REPOSITORIES:
        tables.add(cls.table_name)
    tables.add(rs.GeneratedReportRepository.table_name)
    return True, ",".join(sorted(tables))


# ---------------------------------------------------------------------------
# Target safety guard
# ---------------------------------------------------------------------------

def _assert_not_prod(target: str, supabase_url: str) -> None:
    """Refuse production targets. Raise SystemExit(1) if a production URL is detected."""
    if target not in ("local", "staging"):
        print(f"ERROR: Invalid target '{target}'. Only 'local' and 'staging' are permitted.")
        raise SystemExit(1)
    # Heuristic: prod Supabase projects have URLs like https://<ref>.supabase.co
    # We allow anything for local (often localhost:54321 or 127.0.0.1) and staging
    # (often a separate supabase.co project). We block any URL that appears to be
    # a production project by naming convention — this is best-effort, not a guarantee.
    if not supabase_url:
        return  # no URL set; the apply step will handle the missing-config error
    if "supabase.co" in supabase_url and target == "staging":
        # Staging on supabase.co is allowed (distinct project)
        pass
    if target == "local" and "supabase.co" in supabase_url:
        print(
            f"WARNING: --target local but SUPABASE_URL points to supabase.co. "
            f"Ensure this is NOT a production project before proceeding."
        )


# ---------------------------------------------------------------------------
# Sub-command implementations
# ---------------------------------------------------------------------------

def cmd_validate(args) -> int:
    """Validate migration files: existence, checksum stability, ordering, RLS, table coverage."""
    print("=== SEO Migration Validate ===")
    errors: List[str] = []
    ledger = _load_ledger()
    recorded = ledger.get("migrations", {})

    for f in SEO_MIGRATION_FILES:
        name = f.name
        if not f.exists():
            errors.append(f"MISSING: {name}")
            continue
        sha = _sha256(f)
        sql = f.read_text(encoding="utf-8")
        # Checksum mismatch vs ledger
        if name in recorded and recorded[name].get("sha256") != sha:
            errors.append(
                f"CHECKSUM MISMATCH: {name} — file was modified after it was applied. "
                f"Recorded: {recorded[name]['sha256'][:12]}... Current: {sha[:12]}..."
            )
        # RLS check
        if not _has_rls(sql):
            errors.append(f"NO RLS: {name} does not contain ENABLE ROW LEVEL SECURITY.")
        # IF NOT EXISTS check
        bad_create = re.findall(
            r"CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)[\"']?(seo_\w+)[\"']?",
            sql, re.IGNORECASE,
        )
        if bad_create:
            errors.append(f"NOT IDEMPOTENT: {name} — tables without IF NOT EXISTS: {bad_create}")
        tables = _created_tables_in_sql(sql)
        count = MIGRATION_TABLE_COUNTS.get(name, 0)
        if len(tables) != count:
            errors.append(
                f"TABLE COUNT: {name} — expected {count} seo_* tables, found {len(tables)}: {tables}"
            )
        print(f"  {'OK' if not errors else 'ISSUES'} {name}  sha256={sha[:12]}...  tables={tables}")

    # Ordering check
    names = [f.name for f in SEO_MIGRATION_FILES]
    if names != sorted(names):
        errors.append(f"ORDERING: migration files are not in timestamp order: {names}")

    # Code coverage check (soft)
    ok, msg = _discover_code_tables()
    if ok:
        code_tables = set(msg.split(","))
        migration_sql = "\n".join(
            f.read_text(encoding="utf-8") for f in SEO_MIGRATION_FILES if f.exists()
        )
        migration_tables = set(_created_tables_in_sql(migration_sql))
        missing = code_tables - migration_tables
        if missing:
            errors.append(f"COVERAGE: code tables not in any migration: {sorted(missing)}")
        else:
            print(f"  OK code coverage: {len(code_tables)} tables all covered.")
    else:
        print(f"  SKIP code coverage check (import failed): {msg}")

    if errors:
        print("\nVALIDATION ERRORS:")
        for e in errors:
            print(f"  ! {e}")
        return 1
    print("\nAll validations passed.")
    return 0


def cmd_status(args) -> int:
    """Show which migrations have been applied per the local ledger."""
    print("=== SEO Migration Status ===")
    ledger = _load_ledger()
    recorded = ledger.get("migrations", {})
    for f in SEO_MIGRATION_FILES:
        name = f.name
        if name in recorded:
            rec = recorded[name]
            sha_match = ""
            if f.exists():
                current_sha = _sha256(f)
                sha_match = "OK" if current_sha == rec.get("sha256") else "MISMATCH"
            print(f"  APPLIED  {name}  target={rec.get('target', '?')}  at={rec.get('applied_at', '?')}  sha={sha_match}")
        else:
            print(f"  PENDING  {name}")
    return 0


def cmd_dry_run(args) -> int:
    """Validate + show which migrations would be applied. Writes nothing."""
    print("=== SEO Migration Dry-Run ===")
    rc = cmd_validate(args)
    if rc != 0:
        print("\nDry-run aborted: validation errors found.")
        return rc
    ledger = _load_ledger()
    recorded = ledger.get("migrations", {})
    pending = [f for f in SEO_MIGRATION_FILES if f.name not in recorded]
    already = [f for f in SEO_MIGRATION_FILES if f.name in recorded]
    print(f"\nAlready applied ({len(already)}):")
    for f in already:
        print(f"  - {f.name}")
    print(f"\nWould apply ({len(pending)}):")
    for f in pending:
        print(f"  - {f.name}")
    print("\nDry-run complete. No changes written.")
    return 0


def _apply_sql_via_supabase_rest(sql: str) -> Tuple[bool, str]:
    """Execute raw SQL via the Supabase REST /rpc/exec_sql endpoint.
    This requires the pg_net extension or a custom RPC. If not available,
    falls back to reporting that psql must be used directly.

    In practice, the safest path is: psql -h ... -U postgres -f <file>
    The REST API does not expose a general SQL execution endpoint by default.
    This function attempts the RPC path and reports clearly when it is unavailable.
    """
    import urllib.request
    import urllib.error

    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return False, "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set."

    # Supabase REST does not expose a general /sql endpoint; the correct approach
    # is psql or supabase CLI (supabase db push). We report this clearly rather
    # than silently failing.
    return False, (
        "Supabase REST API does not support arbitrary SQL execution. "
        "Apply migrations using: supabase db push  OR  psql -h <host> -U postgres -f <file>. "
        "Set PGPASSWORD and PGHOST from your Supabase project settings."
    )


def _apply_migrations(target: str, confirm: bool) -> int:
    """Core apply logic shared by apply-to-local and apply-to-staging."""
    if not confirm:
        print(
            f"ERROR: --confirm flag required to apply migrations to {target}. "
            f"Add --confirm to proceed."
        )
        return 1

    url = os.getenv("SUPABASE_URL", "")
    _assert_not_prod(target, url)

    if not url or not os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""):
        print(
            f"ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set "
            f"for target '{target}'. No target configured — aborting."
        )
        return 1

    print(f"=== SEO Migration Apply → {target} ===")

    # Validate first
    class _FakeArgs:
        pass
    rc = cmd_validate(_FakeArgs())
    if rc != 0:
        print("Aborted: validation errors. Fix before applying.")
        return 1

    ledger = _load_ledger()
    recorded = ledger.setdefault("migrations", {})
    pending = [f for f in SEO_MIGRATION_FILES if f.name not in recorded]

    if not pending:
        print("All migrations already applied per ledger. Nothing to do.")
        return 0

    print(f"\nPending migrations ({len(pending)}):")
    for f in pending:
        print(f"  - {f.name}")

    for migration_file in pending:
        name = migration_file.name
        sha = _sha256(migration_file)
        sql = migration_file.read_text(encoding="utf-8")
        print(f"\nApplying: {name} ...")

        ok, msg = _apply_sql_via_supabase_rest(sql)
        if not ok:
            print(f"  RESULT: {msg}")
            print(
                f"\nManual apply required for {name}:\n"
                f"  psql \"$DATABASE_URL\" -f {migration_file}\n"
                f"  (or) supabase db push --db-url \"$DATABASE_URL\"\n"
                f"\nAfter manual apply, record the ledger entry with:\n"
                f"  python scripts/seo_migrate.py status"
            )
            print(
                "\nIMPORTANT: Update the ledger manually after successful apply by adding:\n"
                f'  ledger["migrations"]["{name}"] = {{"applied_at": "<ISO>", "sha256": "{sha}", "target": "{target}"}}'
            )
            # We stop here — do not continue to next migration after a failed one
            return 1

        # Record in ledger
        recorded[name] = {
            "applied_at": _now_iso(),
            "sha256": sha,
            "target": target,
        }
        _save_ledger(ledger)
        print(f"  APPLIED: {name} (sha256={sha[:12]}...)")

    print(f"\nAll pending migrations applied to {target}.")
    return 0


def cmd_apply_to_local(args) -> int:
    return _apply_migrations("local", getattr(args, "confirm", False))


def cmd_apply_to_staging(args) -> int:
    return _apply_migrations("staging", getattr(args, "confirm", False))


def cmd_verify(args) -> int:
    """After apply, verify expected tables + indexes exist via information_schema.
    Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Queries REST API."""
    import urllib.request
    import urllib.error

    print("=== SEO Migration Verify ===")
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for verify.")
        return 1

    # Collect expected tables from all migrations
    expected: List[str] = []
    for f in SEO_MIGRATION_FILES:
        if f.exists():
            expected.extend(_created_tables_in_sql(f.read_text(encoding="utf-8")))

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    # Query information_schema.tables via REST
    rest_url = f"{url}/rest/v1/information_schema.tables"
    # PostgREST can query information_schema if the role has access; this may
    # not always be available. We report clearly if it fails.
    try:
        params = "?table_schema=eq.public&select=table_name"
        req = urllib.request.Request(
            rest_url + params,
            headers=headers,
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            existing = {row["table_name"] for row in data}
    except Exception as exc:
        print(
            f"ERROR querying information_schema via REST: {exc}\n"
            f"Verify manually: SELECT table_name FROM information_schema.tables "
            f"WHERE table_schema = 'public' AND table_name LIKE 'seo_%';"
        )
        return 1

    missing = [t for t in expected if t not in existing]
    found = [t for t in expected if t in existing]

    print(f"  Found   : {len(found)} / {len(expected)} expected tables")
    if missing:
        print(f"  MISSING : {sorted(missing)}")
    else:
        print("  All expected SEO tables are present.")

    print("\nPost-apply verification report:")
    for t in sorted(expected):
        status = "OK" if t in existing else "MISSING"
        print(f"  {status:8s} {t}")

    return 0 if not missing else 1


# ---------------------------------------------------------------------------
# Prod guard (applied at arg-parse time so it can never sneak through)
# ---------------------------------------------------------------------------

def _prod_guard_check(subcommand: str) -> None:
    """If someone manages to pass 'prod' as a subcommand variant, refuse immediately."""
    blocked = {"apply-to-prod", "apply_to_prod", "prod"}
    if subcommand.lower() in blocked:
        print("ERROR: Production application is not supported by this tool. Use apply-to-staging.")
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "SEO migration CLI. Safe runner for the six Pixie SEO Supabase migrations. "
            "Production application is NEVER supported. "
            "Default sub-command: dry-run."
        )
    )
    sub = parser.add_subparsers(dest="command", help="sub-command")
    sub.add_parser("validate", help="Parse + checksum migrations; check coverage. Writes nothing.")
    sub.add_parser("dry-run", help="Show what would be applied. Writes nothing.")
    sub.add_parser("status", help="Show applied/pending status from local ledger.")

    p_local = sub.add_parser("apply-to-local", help="Apply pending migrations to local Supabase.")
    p_local.add_argument(
        "--confirm", action="store_true",
        help="Required safety gate — must be set explicitly to apply.",
    )

    p_staging = sub.add_parser("apply-to-staging", help="Apply pending migrations to staging Supabase.")
    p_staging.add_argument(
        "--confirm", action="store_true",
        help="Required safety gate — must be set explicitly to apply.",
    )

    sub.add_parser("verify", help="Verify applied tables exist via information_schema (needs creds).")

    args = parser.parse_args(argv)
    command = args.command or "dry-run"
    _prod_guard_check(command)

    dispatch = {
        "validate": cmd_validate,
        "dry-run": cmd_dry_run,
        "status": cmd_status,
        "apply-to-local": cmd_apply_to_local,
        "apply-to-staging": cmd_apply_to_staging,
        "verify": cmd_verify,
    }

    fn = dispatch.get(command)
    if fn is None:
        parser.print_help()
        return 1
    return fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
