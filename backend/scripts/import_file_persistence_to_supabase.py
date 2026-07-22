"""Migrate durable JSON file persistence (.pixie_data) into Supabase. Non-destructive.

Reads the file-mode row stores (``row_<table>.json``) and KV blobs and upserts them
into Supabase (row tables + ``pixie_kv``). Upserts are idempotent (merge on primary
key), so re-running is safe and NOTHING is ever deleted. Run AFTER applying the
migrations (see supabase/migrations/*).

SAFETY: dry-run is the DEFAULT. It previews record counts and conflicts and writes
nothing. Pass ``--apply`` to actually upsert. Sealed credential rows (cc_credentials)
are migrated as-is; their contents are NEVER printed — only counts are shown.

    # preview (writes nothing)
    PIXIE_DATA_DIR=backend/.pixie_data python scripts/import_file_persistence_to_supabase.py

    # apply
    PIXIE_DATA_DIR=backend/.pixie_data SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
        python scripts/import_file_persistence_to_supabase.py --apply

Options:
    --apply                 actually write (default is dry-run preview)
    --on-conflict skip|fail how to treat rows already present at the destination
                            (default: skip — leave the existing row untouched)
    --only TABLE            migrate a single row table (repeatable)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Callable, Optional

# make backend/ importable when run from scripts/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _data_dir(explicit: Optional[str] = None) -> Path:
    return Path(explicit or os.getenv("PIXIE_DATA_DIR")
               or str(Path(__file__).resolve().parent.parent / ".pixie_data"))


def _read_rows(path: Path) -> list:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, list) else []
    except (ValueError, OSError):
        return []


class MigrationConflict(RuntimeError):
    """Raised (only with on_conflict='fail') when a destination row already exists."""


def migrate(
    data_dir,
    *,
    dry_run: bool = True,
    on_conflict: str = "skip",
    only: Optional[list] = None,
    dest_table_factory: Optional[Callable] = None,
    kv_save: Optional[Callable] = None,
) -> dict:
    """Core migration — pure and testable. Reads file row stores from ``data_dir``
    and upserts into the destination provided by ``dest_table_factory(table_name)``
    (defaults to the live ``persistence.table``). Returns a per-table summary with
    found / new / existing / migrated / conflicts. Preserves id + tenant_id +
    timestamps exactly (rows are copied verbatim). Never deletes.
    """
    data_dir = Path(data_dir)
    if dest_table_factory is None:
        import persistence
        dest_table_factory = persistence.table
    if kv_save is None:
        import persistence
        kv_save = persistence.save

    summary: dict = {"dry_run": dry_run, "on_conflict": on_conflict, "tables": {}, "kv": {}, "conflicts_total": 0}
    if not data_dir.exists():
        summary["error"] = f"no data dir at {data_dir}"
        return summary

    for path in sorted(data_dir.glob("*.json")):
        if path.name.startswith("row_"):
            table = path.stem[len("row_"):]
            if only and table not in only:
                continue
            rows = _read_rows(path)
            dest = dest_table_factory(table)
            found = new = existing = migrated = conflicts = 0
            for row in rows:
                found += 1
                tenant = row.get("tenant_id", "")
                rid = row.get("id", "")
                already = dest.get(tenant, rid) is not None
                if already:
                    existing += 1
                    if on_conflict == "fail":
                        conflicts += 1
                        summary["conflicts_total"] += 1
                        continue
                    # skip → leave the destination row untouched
                    continue
                new += 1
                if not dry_run:
                    dest.upsert(dict(row))  # copy verbatim: id/tenant/timestamps/data preserved
                    migrated += 1
            summary["tables"][table] = {
                "found": found, "new": new, "existing": existing,
                "migrated": migrated, "conflicts": conflicts,
            }
        elif not (only):
            # KV blob (e.g. pixie_kv collections). Preview by name; never print data.
            name = path.stem
            summary["kv"][name] = {"present": True, "migrated": (not dry_run)}
            if not dry_run:
                data = _read_rows(path) or json.loads(path.read_text(encoding="utf-8"))
                kv_save(name, data)

    if on_conflict == "fail" and summary["conflicts_total"] and not dry_run:
        raise MigrationConflict(f"{summary['conflicts_total']} row(s) already exist at destination")
    return summary


def _print_summary(s: dict) -> None:
    mode = "DRY-RUN (no writes)" if s.get("dry_run") else "APPLIED"
    print(f"File → Supabase migration [{mode}] on_conflict={s.get('on_conflict')}")
    if s.get("error"):
        print(f"  {s['error']}")
        return
    for table, t in sorted(s.get("tables", {}).items()):
        print(f"  rows  {table:28s} found={t['found']:5d} new={t['new']:5d} existing={t['existing']:5d} "
              f"migrated={t['migrated']:5d} conflicts={t['conflicts']:5d}")
    for name in sorted(s.get("kv", {})):
        print(f"  kv    {name}")
    print(f"  conflicts_total={s.get('conflicts_total', 0)}")


def main(argv: Optional[list] = None) -> int:
    ap = argparse.ArgumentParser(description="Migrate file persistence into Supabase (non-destructive).")
    ap.add_argument("--apply", action="store_true", help="actually write (default: dry-run preview)")
    ap.add_argument("--on-conflict", choices=["skip", "fail"], default="skip")
    ap.add_argument("--only", action="append", default=None, help="migrate a single row table (repeatable)")
    ap.add_argument("--data-dir", default=None)
    args = ap.parse_args(argv)

    if args.apply:
        import persistence
        if not persistence.supabase_configured():
            print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — cannot --apply.")
            return 1
        os.environ["PIXIE_PERSIST"] = "supabase"  # force the supabase backend for writes

    try:
        s = migrate(_data_dir(args.data_dir), dry_run=(not args.apply),
                    on_conflict=args.on_conflict, only=args.only)
    except MigrationConflict as exc:
        print(f"ABORTED: {exc}")
        return 2
    _print_summary(s)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
