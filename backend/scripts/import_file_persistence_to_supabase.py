"""Import existing durable JSON (.pixie_data) into Supabase. Non-destructive.

Reads the file-mode stores and upserts them into Supabase (row tables + pixie_kv).
Upserts are idempotent (merge on primary key), so re-running is safe. Nothing is
deleted. Run AFTER applying meta/migrations.sql.

    PIXIE_DATA_DIR=backend/.pixie_data \\
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
    python scripts/import_file_persistence_to_supabase.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# make backend/ importable when run from scripts/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["PIXIE_PERSIST"] = "supabase"  # force the supabase backend for writes

import persistence  # noqa: E402


def main() -> int:
    if not persistence.supabase_configured():
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.")
        return 1

    data_dir = Path(os.getenv("PIXIE_DATA_DIR", str(Path(__file__).resolve().parent.parent / ".pixie_data")))
    if not data_dir.exists():
        print(f"No data dir at {data_dir} — nothing to import.")
        return 0

    kv_count = row_count = 0
    for path in sorted(data_dir.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError) as exc:
            print(f"skip {path.name}: {exc}")
            continue

        if path.name.startswith("row_"):
            table_name = path.stem[len("row_"):]
            repo = persistence.table(table_name)
            for row in payload:
                repo.upsert(row)
                row_count += 1
            print(f"rows  → {table_name}: {len(payload)}")
        else:
            persistence.save(path.stem, payload)  # KV (pixie_kv)
            kv_count += 1
            print(f"kv    → {path.stem}")

    print(f"\nDone. {kv_count} KV collection(s), {row_count} row(s) upserted into Supabase.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
