"""AI Receptionist migration CLI — safe validator/runner for the receptionist
Supabase migrations. NOT run in tests.

Default is dry-run. Production application is BLOCKED by design; only a local or
staging target with --confirm is accepted, and only after validation. Secrets are
never printed; output is table/index/migration NAMES only.

Usage:
    python scripts/receptionist_migrate.py validate
    python scripts/receptionist_migrate.py dry-run          # default
    python scripts/receptionist_migrate.py status
    python scripts/receptionist_migrate.py verify            # requires SUPABASE_URL+key
    python scripts/receptionist_migrate.py apply-to-local   --confirm
    python scripts/receptionist_migrate.py apply-to-staging --confirm
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
MIGRATIONS_DIR = REPO_DIR / "supabase" / "migrations"
MIGRATION_FILES = [
    MIGRATIONS_DIR / "20260709_ai_receptionist.sql",
    MIGRATIONS_DIR / "20260730_receptionist_foundation.sql",
    MIGRATIONS_DIR / "20260802_receptionist_google.sql",
    MIGRATIONS_DIR / "20260803_receptionist_whatsapp.sql",
    MIGRATIONS_DIR / "20260810_receptionist_meta_messaging.sql",
]

sys.path.insert(0, str(BACKEND_DIR))


def _sql() -> str:
    return "\n".join(f.read_text(encoding="utf-8") for f in MIGRATION_FILES if f.exists())


def _created_tables(sql: str) -> set:
    return {m.lower() for m in re.findall(
        r"create\s+table\s+(?:if\s+not\s+exists\s+)?[\"']?([a-zA-Z0-9_]+)", sql, re.I)
        if m.lower().startswith("receptionist_")}


def _code_tables() -> set:
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    return set(stores.ALL_TABLES) | {jobs_store.T_JOBS, jobs_store.T_ATTEMPTS}


def cmd_validate() -> int:
    missing_files = [f.name for f in MIGRATION_FILES if not f.exists()]
    if missing_files:
        print(f"FAIL: missing migration files: {missing_files}")
        return 1
    created = _created_tables(_sql())
    missing = sorted(_code_tables() - created)
    if missing:
        print(f"FAIL: code tables not covered by migrations: {missing}")
        return 1
    if not re.search(r"enable\s+row\s+level\s+security", _sql(), re.I):
        print("FAIL: no RLS statements found")
        return 1
    print(f"OK: {len(created)} receptionist tables covered across {len(MIGRATION_FILES)} migrations; RLS present")
    return 0


def cmd_status() -> int:
    for f in MIGRATION_FILES:
        print(f"{'present' if f.exists() else 'MISSING':8} {f.name}")
    return 0


def _refuse_production(target: str) -> None:
    url = os.getenv("SUPABASE_URL", "")
    if target not in ("local", "staging"):
        print("FAIL: only --target local|staging is supported; production is refused")
        raise SystemExit(2)
    if target == "staging" and "staging" not in url and url:
        print("FAIL: SUPABASE_URL does not look like a staging target; refusing")
        raise SystemExit(2)


def cmd_apply(target: str, confirm: bool) -> int:
    _refuse_production(target)
    if not confirm:
        print("Refusing to apply without --confirm (default is dry-run).")
        return cmd_validate()
    if cmd_validate() != 0:
        return 1
    if not (os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY")):
        print("BLOCKED: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set for the target. "
              "Application is externally blocked — no credentials invented.")
        return 1
    print(f"Would apply {len(MIGRATION_FILES)} migrations to {target}. "
          "Run the SQL via the Supabase SQL editor / psql; this tool does not push DDL automatically.")
    return 0


def cmd_verify() -> int:
    if not (os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY")):
        print("BLOCKED: no target credentials — verification externally blocked.")
        return 1
    print("verify: query information_schema for the tables/indexes listed in RECEPTIONIST_MANIFEST.md")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Receptionist migration tool (default: dry-run)")
    p.add_argument("command", nargs="?", default="dry-run",
                   choices=["validate", "dry-run", "status", "verify", "apply-to-local", "apply-to-staging"])
    p.add_argument("--confirm", action="store_true")
    args = p.parse_args()

    if args.command in ("validate", "dry-run"):
        return cmd_validate()
    if args.command == "status":
        return cmd_status()
    if args.command == "verify":
        return cmd_verify()
    if args.command == "apply-to-local":
        return cmd_apply("local", args.confirm)
    if args.command == "apply-to-staging":
        return cmd_apply("staging", args.confirm)
    return cmd_validate()


if __name__ == "__main__":
    raise SystemExit(main())
