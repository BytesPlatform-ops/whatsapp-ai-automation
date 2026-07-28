"""SEO feature-flag module — single, testable source of truth for all SEO write/activation gates.

Reading env flags
-----------------
All flags are read live (not cached at import) so that tests can monkeypatch os.environ
without reload games. The public surface is a set of plain functions plus two guard
helpers.

Flag effects (authoritative table)
-----------------------------------
Flag env var                    | Accessor fn            | Off behaviour            | On behaviour
--------------------------------|------------------------|--------------------------|-------------------------------
SEO_PRODUCTION_MODE             | production_mode()      | Dev/test defaults apply  | Locks in several safety checks
SEO_READ_ONLY_MODE              | read_only_mode()       | Writes allowed           | ALL SEO writes blocked (FlagBlocked)
SEO_ALLOWED_WORKSPACE_IDS       | workspace_allowed(tid) | All workspaces allowed   | Only listed tenant_ids allowed
SEO_SCHEDULER_OBSERVE_ONLY      | scheduler_observe_only()| Scheduler executes jobs | Scheduler ticks but does NOT run jobs
SEO_OUTREACH_SEND_ENABLED       | outreach_send_enabled()| Email sends blocked      | Outreach emails can be sent
SEO_GBP_WRITE_ENABLED           | gbp_write_enabled()    | GBP writes blocked       | GBP API writes allowed
SEO_WORDPRESS_WRITE_ENABLED     | wordpress_write_enabled()| WP writes blocked      | WordPress REST writes allowed
SEO_PDF_ENABLED                 | pdf_enabled()          | PDF generation blocked   | PDF reports can be generated
(derived)                       | live_provider_enabled(p)| Always False            | True when production_mode() and not read_only

Rollback contract
-----------------
Disabling a flag NEVER deletes stored data. Flags gate NEW writes/sends. Existing DB
rows, scheduler jobs (once claimed), and stored credentials are untouched. This means
toggling any flag is safe and reversible.

FlagBlocked
-----------
Raised by assert_write_allowed / guard_write when a write is blocked. Callers that
want FastAPI HTTP semantics should call guard_write() — it raises HTTPException(403).
Callers that want a plain Python check call assert_write_allowed() which raises
FlagBlocked (a subclass of RuntimeError).
"""

from __future__ import annotations

import os
from typing import Optional


# ── Typed exception ───────────────────────────────────────────────────────────

class FlagBlocked(RuntimeError):
    """Raised when a write is blocked by a feature flag.

    Attributes
    ----------
    kind:      the write operation name (e.g. "outreach_send", "gbp_write")
    reason:    human-readable explanation
    flag:      the env-var name that caused the block (if applicable)
    """

    def __init__(self, kind: str, reason: str, *, flag: Optional[str] = None) -> None:
        self.kind = kind
        self.reason = reason
        self.flag = flag
        super().__init__(f"seo.flags: write blocked [{kind}]: {reason}")


# ── Env-reading helpers ───────────────────────────────────────────────────────

def _truthy(name: str) -> bool:
    """Return True when the named env var is set to a truthy value."""
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


def _csv(name: str) -> list[str]:
    """Return a stripped list from a comma-separated env var. Empty list if unset."""
    raw = os.getenv(name, "").strip()
    if not raw:
        return []
    return [v.strip() for v in raw.split(",") if v.strip()]


# ── Public flag accessors ──────────────────────────────────────────────────────

def production_mode() -> bool:
    """True when SEO_PRODUCTION_MODE=1.

    Effect: activates live-provider checks, requires workspace allowlisting in
    assert_write_allowed, and is a prerequisite for live_provider_enabled().
    Safe defaults (off): dev and test behaviour — no live provider calls, no
    allowlist enforcement, obfuscation fallback for tokens is permitted.
    """
    return _truthy("SEO_PRODUCTION_MODE")


def read_only_mode() -> bool:
    """True when SEO_READ_ONLY_MODE=1.

    Effect: assert_write_allowed / guard_write block ALL write operations
    regardless of other flags. Used to freeze the SEO layer during maintenance,
    rollback, or investigation. Stored data is never touched — only new writes
    are blocked.
    """
    return _truthy("SEO_READ_ONLY_MODE")


def workspace_allowed(tenant_id: str) -> bool:
    """True when tenant_id is permitted to use SEO writes.

    Reads SEO_ALLOWED_WORKSPACE_IDS (comma-separated tenant IDs).
    - When the list is EMPTY (not set) → ALL workspaces are allowed (default).
    - When the list is NON-EMPTY → only listed tenant_ids pass.

    This allows controlled rollout to one internal workspace before expanding.
    """
    allowed = _csv("SEO_ALLOWED_WORKSPACE_IDS")
    if not allowed:
        return True  # empty = all allowed (open access)
    return tenant_id in allowed


def scheduler_observe_only() -> bool:
    """True when SEO_SCHEDULER_OBSERVE_ONLY=1.

    Effect: the scheduler thread ticks (runs _tick() / due_fn() scans) but
    does NOT execute job run_fn() callbacks. This lets operators verify the
    scheduler can see due work without side effects. Jobs stay in 'due' state.
    Safe default (off): scheduler executes normally.
    """
    return _truthy("SEO_SCHEDULER_OBSERVE_ONLY")


def outreach_send_enabled() -> bool:
    """True when SEO_OUTREACH_SEND_ENABLED=1.

    Effect: email sends in the outreach system are gated. When False, outreach
    emails are drafted and queued but NOT dispatched via the SMTP/SES provider.
    Must be explicitly enabled before any live email campaign.
    """
    return _truthy("SEO_OUTREACH_SEND_ENABLED")


def gbp_write_enabled() -> bool:
    """True when SEO_GBP_WRITE_ENABLED=1.

    Effect: Google Business Profile API write calls (update business info,
    respond to reviews, post updates) are permitted. When False, all GBP writes
    are blocked; GBP reads/syncs are unaffected.
    """
    return _truthy("SEO_GBP_WRITE_ENABLED")


def wordpress_write_enabled() -> bool:
    """True when SEO_WORDPRESS_WRITE_ENABLED=1.

    Effect: WordPress REST API write calls (publish posts, update pages,
    inject schema) are permitted. When False, WP writes are blocked; crawl
    and read operations are unaffected.
    """
    return _truthy("SEO_WORDPRESS_WRITE_ENABLED")


def pdf_enabled() -> bool:
    """True when SEO_PDF_ENABLED=1.

    Effect: PDF report generation and serving is permitted. When False,
    PDF endpoints return a 423/503 or equivalent; HTML reports still work.
    """
    return _truthy("SEO_PDF_ENABLED")


def live_provider_enabled(provider: str) -> bool:  # noqa: ARG001 (provider reserved for future per-provider flags)
    """True when live (non-mock) provider calls are permitted.

    Derived from: production_mode() AND NOT read_only_mode().
    The ``provider`` argument is accepted for future per-provider flags
    (e.g. SEO_PROVIDER_SEMRUSH_ENABLED) and is currently unused — all live
    providers share the same gate.
    """
    return production_mode() and not read_only_mode()


# ── Write guard ───────────────────────────────────────────────────────────────

# Map write kind → (flag_fn, flag_env_var) for specific write types.
# A missing kind defaults to the global read_only / workspace checks only.
_KIND_FLAG_MAP: dict[str, tuple] = {
    "outreach_send": (outreach_send_enabled, "SEO_OUTREACH_SEND_ENABLED"),
    "gbp_write":     (gbp_write_enabled,     "SEO_GBP_WRITE_ENABLED"),
    "wordpress_write": (wordpress_write_enabled, "SEO_WORDPRESS_WRITE_ENABLED"),
    "pdf":           (pdf_enabled,           "SEO_PDF_ENABLED"),
}


def assert_write_allowed(kind: str, tenant_id: str) -> None:
    """Raise FlagBlocked when the write operation is not permitted.

    Checks applied in order (first failure raises):
    1. read_only_mode() — blocks all writes
    2. workspace_allowed(tenant_id) — blocks non-allowlisted workspaces (in
       production_mode or when the allowlist is non-empty)
    3. specific write flag for ``kind`` (if mapped in _KIND_FLAG_MAP)

    Parameters
    ----------
    kind:       operation name — one of the keys in _KIND_FLAG_MAP (e.g.
                "outreach_send") or any custom string for generic write gating.
    tenant_id:  the workspace/tenant performing the write.

    Raises
    ------
    FlagBlocked — with .kind, .reason, and .flag set.

    Does NOT raise when all checks pass. Safe to call in hot paths.
    """
    # Check 1: read-only mode blocks everything
    if read_only_mode():
        raise FlagBlocked(
            kind, "SEO is in read-only mode — all writes are blocked",
            flag="SEO_READ_ONLY_MODE",
        )

    # Check 2: workspace allowlist (enforced when non-empty, regardless of production_mode)
    allowed_ids = _csv("SEO_ALLOWED_WORKSPACE_IDS")
    if allowed_ids and tenant_id not in allowed_ids:
        raise FlagBlocked(
            kind,
            f"Workspace '{tenant_id}' is not in SEO_ALLOWED_WORKSPACE_IDS",
            flag="SEO_ALLOWED_WORKSPACE_IDS",
        )

    # Check 3: specific write-kind flag
    if kind in _KIND_FLAG_MAP:
        flag_fn, flag_env = _KIND_FLAG_MAP[kind]
        if not flag_fn():
            raise FlagBlocked(
                kind,
                f"Write kind '{kind}' is disabled — set {flag_env}=1 to enable",
                flag=flag_env,
            )


def guard_write(kind: str, tenant_id: str) -> None:
    """FastAPI-friendly guard — raises HTTPException(403) instead of FlagBlocked.

    Suitable for use inside FastAPI route handlers or as a Depends. Callers in
    non-HTTP contexts should use assert_write_allowed() directly.

    Example usage in a route:

        @router.post("/outreach/send")
        async def send_outreach(body: SendBody, tenant: str = Depends(resolve_tenant)):
            guard_write("outreach_send", tenant)
            ...
    """
    try:
        assert_write_allowed(kind, tenant_id)
    except FlagBlocked as exc:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=403,
            detail={"error": "seo_write_blocked", "kind": exc.kind, "reason": exc.reason},
        ) from exc


# ── Summary (for health endpoints / activation checks) ────────────────────────

def flags_status() -> dict:
    """Return a non-secret flag status snapshot. Safe for health endpoints."""
    return {
        "production_mode": production_mode(),
        "read_only_mode": read_only_mode(),
        "scheduler_observe_only": scheduler_observe_only(),
        "outreach_send_enabled": outreach_send_enabled(),
        "gbp_write_enabled": gbp_write_enabled(),
        "wordpress_write_enabled": wordpress_write_enabled(),
        "pdf_enabled": pdf_enabled(),
        "live_provider_enabled": live_provider_enabled("*"),
        "allowed_workspace_ids_count": len(_csv("SEO_ALLOWED_WORKSPACE_IDS")),
        "all_workspaces_allowed": not _csv("SEO_ALLOWED_WORKSPACE_IDS"),
    }
