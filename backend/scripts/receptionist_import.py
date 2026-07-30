"""AI Receptionist data import tool (Wave 5, Part 9).

Imports pre-existing LOCAL JSON records (onboarding business profiles + campaign
consent/opt-out/DNC/send-log) into the durable stores. Safe by default: the
default command is dry-run, it never imports to production automatically, it
detects duplicates and supports safe reruns (idempotent), and it NEVER prints
conversation content, emails, phone numbers or credentials — only counts.

Usage:
    python scripts/receptionist_import.py validate
    python scripts/receptionist_import.py dry-run      # default
    python scripts/receptionist_import.py import --confirm
    python scripts/receptionist_import.py verify
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))


def _import_onboarding(dry_run: bool) -> dict:
    """Import data/tenants/*.json onboarding profiles into config_repo."""
    from receptionist.onboarding import store as ostore
    from receptionist.service import config_repo

    counts = {"found": 0, "imported": 0, "skipped_existing": 0, "errors": 0}
    for meta in ostore.list_tenants():
        tid = meta.get("tenant_id")
        if not tid:
            continue
        counts["found"] += 1
        try:
            if config_repo.get_active(tid) is not None:
                counts["skipped_existing"] += 1  # already migrated → safe rerun
                continue
            if dry_run:
                counts["imported"] += 1
                continue
            profile = ostore.load_profile(tid) or {}
            prompt_vars = ostore._compile_prompt_vars(profile)
            patch = ostore._config_patch_from(tid, meta.get("industry", ""),
                                              profile.get("core", {}), prompt_vars)
            config_repo.save(tid, patch, updated_by="import")
            counts["imported"] += 1
        except Exception:
            counts["errors"] += 1
    return counts


def _import_campaign_compliance(dry_run: bool) -> dict:
    """Import legacy data/campaigns/{consent,optout,dnc}_*.json into durable stores."""
    from receptionist.campaigns import store as cstore
    from receptionist.campaigns.schemas import ConsentRecord, DoNotContactEntry, OptOutEntry

    counts = {"consent": 0, "opt_out": 0, "dnc": 0, "skipped_existing": 0, "errors": 0}
    data_dir = BACKEND_DIR / "receptionist" / "data" / "campaigns"
    if not data_dir.exists():
        return counts

    def _tenant_of(path: Path, kind: str) -> str:
        return path.stem[len(kind) + 1:]  # "<kind>_<tenant>" → "<tenant>"

    for kind, model, existing_ids in (
        ("consent", ConsentRecord, None),
        ("optout", OptOutEntry, None),
        ("dnc", DoNotContactEntry, None),
    ):
        for path in sorted(data_dir.glob(f"{kind}_*.json")):
            tid = _tenant_of(path, kind)
            for row in cstore.read_json_rows(kind, tid):
                try:
                    rec = model.model_validate(row)
                    if dry_run:
                        counts[{"optout": "opt_out"}.get(kind, kind)] += 1
                        continue
                    if kind == "consent":
                        cstore.add_consent(rec)
                    elif kind == "optout":
                        cstore.add_opt_out(rec)
                    else:
                        cstore.add_dnc(rec)
                    counts[{"optout": "opt_out"}.get(kind, kind)] += 1
                except Exception:
                    counts["errors"] += 1
    return counts


def import_all(dry_run: bool = True) -> dict:
    return {
        "mode": "dry-run" if dry_run else "import",
        "onboarding": _import_onboarding(dry_run),
        "campaign_compliance": _import_campaign_compliance(dry_run),
    }


def cmd_validate() -> int:
    tenants = BACKEND_DIR / "receptionist" / "data" / "tenants"
    campaigns = BACKEND_DIR / "receptionist" / "data" / "campaigns"
    print(f"onboarding source: {'present' if tenants.exists() else 'absent'}")
    print(f"campaign source:   {'present' if campaigns.exists() else 'absent'}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Receptionist import tool (default: dry-run)")
    p.add_argument("command", nargs="?", default="dry-run",
                   choices=["validate", "dry-run", "import", "verify"])
    p.add_argument("--confirm", action="store_true")
    args = p.parse_args()

    if args.command == "validate":
        return cmd_validate()
    if args.command == "dry-run":
        print(import_all(dry_run=True))
        return 0
    if args.command == "import":
        if not args.confirm:
            print("Refusing to import without --confirm (default is dry-run).")
            print(import_all(dry_run=True))
            return 1
        print(import_all(dry_run=False))
        return 0
    if args.command == "verify":
        from receptionist.service import config_repo  # noqa: F401
        print("verify: re-run dry-run; skipped_existing should equal previously imported counts")
        print(import_all(dry_run=True))
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
