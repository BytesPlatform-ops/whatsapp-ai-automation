"""SEO controlled-activation checklist runner (Part 25).

This module implements a READINESS REPORTER: it validates environment and system
state step-by-step and reports whether each activation prerequisite is met.

IMPORTANT: This module performs NO destructive actions. It does not:
  - run migrations
  - enable flags
  - write to any database
  - send any requests

Actual enabling is done by the operator setting the appropriate env flags and
running the referenced CLI tools. This module only validates + reports readiness.

Usage
-----
    from seo.activation import activation_status
    report = activation_status()
    for step in report["steps"]:
        print(step["step"], step["status"], step["detail"])

Step statuses
-------------
"ok"      — prerequisite is met
"warn"    — non-blocking advisory; activation can proceed
"blocked" — prerequisite not met; this step is blocking (activation should halt)
"skip"    — step is not applicable in the current configuration

Activation sequence (ordered)
------------------------------
 1. validate_environment        — required env vars present, no obvious misconfig
 2. note_db_backup              — advisory: confirm DB is backed up before proceeding
 3. check_migration_script      — scripts/seo_migrate.py exists (dry-run safe)
 4. verify_schema_tables        — key table names readable from persistence layer
 5. check_file_data_import      — file persistence importable (scripts/import_file...)
 6. check_durable_persistence   — PIXIE_PERSIST != memory (file or supabase)
 7. check_encryption_readiness  — crypto.encryption_status() consistent
 8. check_scheduler_observe_only— SEO_SCHEDULER_OBSERVE_ONLY set before full enable
 9. check_scheduler_enabled     — SEO_SCHEDULER_ENABLED set
10. check_mock_provider_mode    — PIXIE_MODEL_MODE != openai (mock scheduler tick safe)
11. check_provider_smoke_test   — live_provider_enabled() coherent with env
12. check_workspace_allowlist   — SEO_ALLOWED_WORKSPACE_IDS set for initial rollout
13. check_billing_visibility    — CREDIT_SYSTEM_ENABLED set (visibility only)
14. check_billing_enforcement   — BILLING_ENFORCEMENT_ENABLED advisory
15. check_live_providers        — SEO_PRODUCTION_MODE + not READ_ONLY = live ok
16. check_read_only_clear       — SEO_READ_ONLY_MODE is off (final gate)
17. check_flag_summary          — flags_status() coherent summary
"""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path
from typing import Optional

# Add backend/ to sys.path so this script is importable from scripts/ too
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


# ── Step result type ──────────────────────────────────────────────────────────

def _step(step: str, status: str, detail: str, *, blocking: bool = False) -> dict:
    """Build a single activation step result."""
    return {
        "step": step,
        "status": status,           # "ok" | "warn" | "blocked" | "skip"
        "detail": detail,
        "blocking": blocking,       # True = activation should halt at this step
    }


# ── Individual check functions ────────────────────────────────────────────────

def validate_environment() -> dict:
    """Check that essential env vars are present and internally consistent."""
    issues = []

    # SUPABASE config should be present for durable mode
    supa_url = os.getenv("SUPABASE_URL", "").strip()
    supa_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supa_url:
        issues.append("SUPABASE_URL not set")
    if not supa_key:
        issues.append("SUPABASE_SERVICE_ROLE_KEY not set")

    # Read-only + production_mode together is a logical contradiction
    ro = os.getenv("SEO_READ_ONLY_MODE", "").strip().lower() in ("1", "true", "yes", "on")
    pm = os.getenv("SEO_PRODUCTION_MODE", "").strip().lower() in ("1", "true", "yes", "on")
    if ro and pm:
        issues.append("SEO_READ_ONLY_MODE=1 and SEO_PRODUCTION_MODE=1 are set simultaneously — remove READ_ONLY before going live")

    # SEO_REQUIRE_TOKEN_ENCRYPTION without GOOGLE_TOKEN_ENCRYPTION_KEY is fatal
    req_enc = os.getenv("SEO_REQUIRE_TOKEN_ENCRYPTION", "").strip().lower() in ("1", "true", "yes", "on")
    enc_key = os.getenv("GOOGLE_TOKEN_ENCRYPTION_KEY", "").strip()
    if req_enc and not enc_key:
        issues.append("SEO_REQUIRE_TOKEN_ENCRYPTION=1 but GOOGLE_TOKEN_ENCRYPTION_KEY is missing")

    if issues:
        return _step(
            "validate_environment", "blocked",
            "Environment issues: " + "; ".join(issues),
            blocking=True,
        )
    return _step("validate_environment", "ok", "Required env vars present and consistent")


def note_db_backup() -> dict:
    """Advisory: operator must confirm DB backup before proceeding."""
    # This step is always "warn" — it's a human action we can't verify in code.
    return _step(
        "note_db_backup", "warn",
        "ACTION REQUIRED (human): confirm a DB backup or snapshot exists before "
        "applying migrations or switching to durable persistence. "
        "This check cannot be automated — operator must confirm manually.",
        blocking=False,
    )


def check_migration_script() -> dict:
    """Verify the SEO migration delegate script exists."""
    script = _BACKEND_DIR / "scripts" / "seo_migrate.py"
    if script.exists():
        return _step("check_migration_script", "ok", f"Migration script found at {script}")
    # Check for the general import script as a fallback indicator
    fallback = _BACKEND_DIR / "scripts" / "import_file_persistence_to_supabase.py"
    if fallback.exists():
        return _step(
            "check_migration_script", "warn",
            f"seo_migrate.py not found at {script}; "
            f"import_file_persistence_to_supabase.py exists as a fallback. "
            "Create scripts/seo_migrate.py before running schema migrations.",
            blocking=False,
        )
    return _step(
        "check_migration_script", "blocked",
        f"Neither seo_migrate.py nor import_file_persistence_to_supabase.py found under {_BACKEND_DIR / 'scripts'}",
        blocking=True,
    )


def verify_schema_tables() -> dict:
    """Check that the persistence layer is importable and table() works."""
    try:
        import persistence  # noqa: PLC0415
        # Create a memory-backed test repo — no DB required
        repo = persistence.table("__activation_probe__")
        _ = repo.list_by_tenant("probe")
        return _step("verify_schema_tables", "ok", "persistence.table() callable; memory backend works")
    except Exception as exc:
        return _step(
            "verify_schema_tables", "blocked",
            f"persistence module error: {exc}",
            blocking=True,
        )


def check_file_data_import() -> dict:
    """Verify the file-persistence import script is importable."""
    try:
        import scripts.import_file_persistence_to_supabase as imp  # noqa: PLC0415
        if callable(getattr(imp, "migrate", None)):
            return _step("check_file_data_import", "ok", "import_file_persistence_to_supabase.migrate() available")
        return _step("check_file_data_import", "warn", "Import script exists but migrate() not found")
    except ImportError:
        # Try direct path import
        script = _BACKEND_DIR / "scripts" / "import_file_persistence_to_supabase.py"
        if script.exists():
            return _step(
                "check_file_data_import", "warn",
                "import_file_persistence_to_supabase.py exists but is not importable via scripts package — "
                "run directly: python scripts/import_file_persistence_to_supabase.py",
                blocking=False,
            )
        return _step(
            "check_file_data_import", "blocked",
            "import_file_persistence_to_supabase.py not found",
            blocking=True,
        )


def check_durable_persistence() -> dict:
    """Verify PIXIE_PERSIST is set to a durable backend (file or supabase)."""
    try:
        import persistence  # noqa: PLC0415
        b = persistence.backend()
    except Exception as exc:
        return _step("check_durable_persistence", "blocked", f"Cannot import persistence: {exc}", blocking=True)

    if b == "supabase":
        try:
            import persistence as p2  # noqa: PLC0415
            if p2.supabase_configured():
                return _step("check_durable_persistence", "ok", "PIXIE_PERSIST=supabase and credentials configured")
            return _step(
                "check_durable_persistence", "blocked",
                "PIXIE_PERSIST=supabase but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing",
                blocking=True,
            )
        except Exception as exc:
            return _step("check_durable_persistence", "blocked", f"Supabase check failed: {exc}", blocking=True)

    if b == "file":
        return _step(
            "check_durable_persistence", "warn",
            "PIXIE_PERSIST=file — durable but single-instance only. "
            "Set PIXIE_PERSIST=supabase for multi-instance production.",
            blocking=False,
        )

    return _step(
        "check_durable_persistence", "blocked",
        "PIXIE_PERSIST is unset or 'memory' — data will be lost on restart. "
        "Set PIXIE_PERSIST=supabase (or 'file' for single-instance).",
        blocking=True,
    )


def check_encryption_readiness() -> dict:
    """Verify token encryption is configured correctly."""
    try:
        from seo.google.crypto import encryption_status, require_encryption  # noqa: PLC0415
        status = encryption_status()
        required = require_encryption()
        mode = status.get("mode", "unknown")

        if required and not status.get("active"):
            return _step(
                "check_encryption_readiness", "blocked",
                "SEO_REQUIRE_TOKEN_ENCRYPTION=1 but Fernet key is missing or invalid "
                f"(mode={mode}). Set a valid GOOGLE_TOKEN_ENCRYPTION_KEY.",
                blocking=True,
            )
        if status.get("active"):
            return _step("check_encryption_readiness", "ok", f"Token encryption active (mode={mode})")
        return _step(
            "check_encryption_readiness", "warn",
            "Token encryption not active (mode=insecure_obfuscation). "
            "Set GOOGLE_TOKEN_ENCRYPTION_KEY + SEO_REQUIRE_TOKEN_ENCRYPTION=1 before production.",
            blocking=False,
        )
    except Exception as exc:
        return _step("check_encryption_readiness", "blocked", f"Crypto module error: {exc}", blocking=True)


def check_scheduler_observe_only() -> dict:
    """Verify scheduler is in observe-only mode before full enable (recommended staged rollout)."""
    from seo.flags import scheduler_observe_only  # noqa: PLC0415
    scheduler_on = os.getenv("SEO_SCHEDULER_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")
    observe = scheduler_observe_only()

    if scheduler_on and not observe:
        return _step(
            "check_scheduler_observe_only", "warn",
            "Scheduler is enabled but SEO_SCHEDULER_OBSERVE_ONLY is not set. "
            "Recommended: enable SEO_SCHEDULER_OBSERVE_ONLY=1 first, "
            "verify dry ticks, then disable it to allow job execution.",
            blocking=False,
        )
    if observe:
        return _step("check_scheduler_observe_only", "ok", "Scheduler is in observe-only mode (safe for initial rollout)")
    return _step(
        "check_scheduler_observe_only", "warn",
        "Scheduler not yet enabled. Set SEO_SCHEDULER_ENABLED=1 + SEO_SCHEDULER_OBSERVE_ONLY=1 for staged start.",
        blocking=False,
    )


def check_scheduler_enabled() -> dict:
    """Verify SEO_SCHEDULER_ENABLED is set."""
    enabled = os.getenv("SEO_SCHEDULER_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")
    if enabled:
        return _step("check_scheduler_enabled", "ok", "SEO_SCHEDULER_ENABLED=1")
    return _step(
        "check_scheduler_enabled", "warn",
        "SEO_SCHEDULER_ENABLED not set — scheduler won't run. "
        "Set to 1 when ready (after observe-only verification).",
        blocking=False,
    )


def check_mock_provider_mode() -> dict:
    """Check that model/provider mode is safe for initial scheduler ticks."""
    model_mode = os.getenv("PIXIE_MODEL_MODE", "fake").strip().lower()
    if model_mode == "fake":
        return _step(
            "check_mock_provider_mode", "ok",
            "PIXIE_MODEL_MODE=fake — scheduler ticks will use mock providers (safe for initial testing)"
        )
    return _step(
        "check_mock_provider_mode", "warn",
        f"PIXIE_MODEL_MODE={model_mode!r} — live models may be called during scheduler ticks. "
        "Switch to fake for initial dry-tick verification.",
        blocking=False,
    )


def check_provider_smoke_test() -> dict:
    """Verify live_provider_enabled() is coherent and flag state makes sense."""
    from seo.flags import live_provider_enabled, production_mode, read_only_mode  # noqa: PLC0415
    live = live_provider_enabled("*")
    pm = production_mode()
    ro = read_only_mode()

    if live:
        return _step(
            "check_provider_smoke_test", "ok",
            "live_provider_enabled=True (production_mode=True, read_only_mode=False) — "
            "live provider calls are permitted."
        )
    if pm and ro:
        return _step(
            "check_provider_smoke_test", "warn",
            "SEO_PRODUCTION_MODE=1 but SEO_READ_ONLY_MODE=1 — live providers blocked. "
            "Disable read_only_mode when ready to activate.",
            blocking=False,
        )
    return _step(
        "check_provider_smoke_test", "warn",
        f"Live providers not yet enabled (production_mode={pm}, read_only_mode={ro}). "
        "Set SEO_PRODUCTION_MODE=1 and remove SEO_READ_ONLY_MODE when ready.",
        blocking=False,
    )


def check_workspace_allowlist() -> dict:
    """Verify SEO_ALLOWED_WORKSPACE_IDS is configured for initial controlled rollout."""
    from seo.flags import _csv  # noqa: PLC0415
    ids = _csv("SEO_ALLOWED_WORKSPACE_IDS")
    if ids:
        return _step(
            "check_workspace_allowlist", "ok",
            f"Workspace allowlist active: {len(ids)} tenant(s) configured. "
            "Add more tenant IDs to expand access."
        )
    return _step(
        "check_workspace_allowlist", "warn",
        "SEO_ALLOWED_WORKSPACE_IDS is empty — all workspaces will have access. "
        "Set a comma-separated list of tenant IDs for initial controlled rollout.",
        blocking=False,
    )


def check_billing_visibility() -> dict:
    """Verify credit system is importable and visibility flag status."""
    try:
        from credits import config as credit_config  # noqa: PLC0415
        enabled = credit_config.credit_system_enabled()
        if enabled:
            return _step(
                "check_billing_visibility", "ok",
                "CREDIT_SYSTEM_ENABLED=1 — billing metering is active (visibility mode)"
            )
        return _step(
            "check_billing_visibility", "warn",
            "CREDIT_SYSTEM_ENABLED is off — metering records nothing. "
            "Set CREDIT_SYSTEM_ENABLED=1 to enable usage visibility before enforcement.",
            blocking=False,
        )
    except Exception as exc:
        return _step("check_billing_visibility", "warn", f"credits.config not importable: {exc}", blocking=False)


def check_billing_enforcement() -> dict:
    """Check billing enforcement status (advisory — not a blocker for initial activation)."""
    try:
        from credits import config as credit_config  # noqa: PLC0415
        enforced = credit_config.billing_enforcement_enabled() if hasattr(credit_config, "billing_enforcement_enabled") else False
        if enforced:
            return _step(
                "check_billing_enforcement", "ok",
                "BILLING_ENFORCEMENT_ENABLED=1 — hard credit limits are enforced"
            )
        return _step(
            "check_billing_enforcement", "warn",
            "BILLING_ENFORCEMENT_ENABLED is off — over-limit operations will not be blocked. "
            "Enable after verifying metering is accurate.",
            blocking=False,
        )
    except Exception as exc:
        return _step("check_billing_enforcement", "warn", f"credits.config not importable: {exc}", blocking=False)


def check_live_providers() -> dict:
    """Verify the live-provider gate is coherent for full production."""
    from seo.flags import production_mode, read_only_mode  # noqa: PLC0415
    pm = production_mode()
    ro = read_only_mode()

    if pm and not ro:
        return _step(
            "check_live_providers", "ok",
            "SEO_PRODUCTION_MODE=1, SEO_READ_ONLY_MODE is off — live providers enabled"
        )
    if not pm:
        return _step(
            "check_live_providers", "warn",
            "SEO_PRODUCTION_MODE not set — live providers disabled. "
            "Set SEO_PRODUCTION_MODE=1 as the final step before full rollout.",
            blocking=False,
        )
    # pm=True, ro=True
    return _step(
        "check_live_providers", "warn",
        "SEO_PRODUCTION_MODE=1 but SEO_READ_ONLY_MODE=1 is still set — live providers are blocked. "
        "Remove SEO_READ_ONLY_MODE when ready.",
        blocking=False,
    )


def check_read_only_clear() -> dict:
    """Final gate: SEO_READ_ONLY_MODE must be off for live operation."""
    from seo.flags import read_only_mode  # noqa: PLC0415
    if read_only_mode():
        return _step(
            "check_read_only_clear", "blocked",
            "SEO_READ_ONLY_MODE=1 — all writes are blocked. "
            "Remove or set to 0 when ready to go live.",
            blocking=True,
        )
    return _step("check_read_only_clear", "ok", "SEO_READ_ONLY_MODE is off — writes are permitted")


def check_flag_summary() -> dict:
    """Final coherence check: produce a flags_status() snapshot."""
    try:
        from seo.flags import flags_status  # noqa: PLC0415
        status = flags_status()
        return _step(
            "check_flag_summary", "ok",
            f"Flags snapshot: {status}"
        )
    except Exception as exc:
        return _step("check_flag_summary", "blocked", f"flags_status() failed: {exc}", blocking=True)


# ── Ordered checklist ─────────────────────────────────────────────────────────

_ORDERED_CHECKS = [
    validate_environment,
    note_db_backup,
    check_migration_script,
    verify_schema_tables,
    check_file_data_import,
    check_durable_persistence,
    check_encryption_readiness,
    check_scheduler_observe_only,
    check_scheduler_enabled,
    check_mock_provider_mode,
    check_provider_smoke_test,
    check_workspace_allowlist,
    check_billing_visibility,
    check_billing_enforcement,
    check_live_providers,
    check_read_only_clear,
    check_flag_summary,
]


def activation_status() -> dict:
    """Run the full ordered activation checklist and return a report.

    Returns
    -------
    dict with:
      "steps": list of step result dicts (ordered)
      "blocking_count": int — number of blocking steps that are not "ok"
      "warn_count": int
      "ok_count": int
      "ready": bool — True only when blocking_count == 0
      "summary": human-readable one-liner

    No destructive actions are performed. Safe to call at any time.
    """
    steps = []
    blocking_count = 0
    warn_count = 0
    ok_count = 0

    for check_fn in _ORDERED_CHECKS:
        try:
            result = check_fn()
        except Exception as exc:
            result = _step(
                check_fn.__name__, "blocked",
                f"Check raised an unexpected error: {exc}",
                blocking=True,
            )
        steps.append(result)
        status = result.get("status", "")
        if status == "ok":
            ok_count += 1
        elif status == "warn":
            warn_count += 1
        elif result.get("blocking"):
            blocking_count += 1

    ready = blocking_count == 0
    if ready and warn_count == 0:
        summary = "All activation checks passed — system is ready."
    elif ready:
        summary = f"Activation checks passed with {warn_count} advisory warning(s)."
    else:
        summary = f"{blocking_count} blocking issue(s) must be resolved before activation."

    return {
        "steps": steps,
        "ok_count": ok_count,
        "warn_count": warn_count,
        "blocking_count": blocking_count,
        "ready": ready,
        "summary": summary,
    }
