"""SEO health checks — liveness, readiness, and dependency health.

Three check levels:
  liveness()   — process is up and event loop is responsive (cheap).
  readiness()  — required config is valid, encryption ready, persistence
                 available, scheduler ownership healthy. CACHED 15s.
  deps()       — dependency health for each external system. CACHED 30s.
                 Uses readiness state — does NOT make live provider calls.

Env vars:
  SEO_HEALTH_REQUIRE_MIGRATIONS — when "1"/"true"/etc., readiness fails if
    migrations haven't been applied (checked via a lightweight marker).
  SEO_HEALTH_CACHE_LIVENESS_S   — liveness cache TTL (default 5s).
  SEO_HEALTH_CACHE_READY_S      — readiness cache TTL (default 15s).
  SEO_HEALTH_CACHE_DEPS_S       — deps cache TTL (default 30s).

No provider network calls are made on any health check path.
"""

from __future__ import annotations

import os
import threading
import time
from typing import Any, Dict, List, Optional, Tuple


# ── Cache ─────────────────────────────────────────────────────────────────────

_cache_lock = threading.Lock()
_cache: Dict[str, Tuple[float, Any]] = {}  # key -> (timestamp, value)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (ValueError, TypeError):
        return default


def _cached(key: str, ttl_s: int, compute_fn) -> Any:
    with _cache_lock:
        entry = _cache.get(key)
        if entry is not None:
            ts, val = entry
            if time.monotonic() - ts < ttl_s:
                return val
    result = compute_fn()
    with _cache_lock:
        _cache[key] = (time.monotonic(), result)
    return result


def invalidate_cache() -> None:
    """Clear all cached health results. Useful after config changes or in tests."""
    with _cache_lock:
        _cache.clear()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


def _encryption_status() -> Dict[str, Any]:
    try:
        from seo.google.crypto import encryption_status
        return encryption_status()
    except Exception as exc:
        return {"active": None, "mode": "error", "required": False, "error": str(exc)}


def _persistence_status() -> Dict[str, Any]:
    try:
        import persistence
        return persistence.status()
    except Exception as exc:
        return {"backend": "unknown", "durable": False, "error": str(exc)}


def _scheduler_health() -> Dict[str, Any]:
    try:
        from seo.scheduler.runtime import _get_active_instance
        inst = _get_active_instance()
        if inst is None:
            return {"enabled": False, "running_thread": False}
        return inst.health()
    except Exception as exc:
        return {"enabled": None, "error": str(exc)}


def _migrations_ok() -> Tuple[bool, Optional[str]]:
    """Cheap migration-state check.

    When SEO_HEALTH_REQUIRE_MIGRATIONS is set, we check that the
    SEO_MIGRATIONS_APPLIED env var is "1" (set by migration runner).
    This avoids any DB round-trip on the health path.
    Returns (ok, detail).
    """
    if not _truthy("SEO_HEALTH_REQUIRE_MIGRATIONS"):
        return True, None
    applied = os.getenv("SEO_MIGRATIONS_APPLIED", "").strip()
    if applied in ("1", "true", "yes", "ok"):
        return True, None
    return False, (
        "SEO_HEALTH_REQUIRE_MIGRATIONS is set but SEO_MIGRATIONS_APPLIED is not '1'. "
        "Run migrations and set SEO_MIGRATIONS_APPLIED=1."
    )


def _required_env_valid() -> Tuple[bool, List[str]]:
    """Check that the minimum required env vars are present."""
    issues: List[str] = []
    # The internal secret check is advisory here — startup_checks handles the hard fail.
    if _truthy("PIXIE_REQUIRE_INTERNAL_SECRET"):
        if not os.getenv("PIXIE_INTERNAL_API_SECRET", "").strip():
            issues.append("PIXIE_INTERNAL_API_SECRET is required but not set")
    return len(issues) == 0, issues


# ── Liveness ──────────────────────────────────────────────────────────────────

def liveness() -> Dict[str, Any]:
    """Process liveness — always cheap, minimal caching."""
    ttl = _env_int("SEO_HEALTH_CACHE_LIVENESS_S", 5)

    def _compute() -> Dict[str, Any]:
        return {
            "status": "ok",
            "check": "live",
            "process": "up",
        }

    return _cached("live", ttl, _compute)


# ── Readiness ─────────────────────────────────────────────────────────────────

def readiness() -> Dict[str, Any]:
    """Service readiness — config valid, encryption ready, persistence up, scheduler ok."""
    ttl = _env_int("SEO_HEALTH_CACHE_READY_S", 15)

    def _compute() -> Dict[str, Any]:
        checks: Dict[str, Any] = {}
        failures: List[str] = []

        # 1. Required env
        env_ok, env_issues = _required_env_valid()
        checks["required_env"] = {"ok": env_ok, "issues": env_issues}
        if not env_ok:
            failures.extend(env_issues)

        # 2. Token encryption
        enc = _encryption_status()
        enc_ok = enc.get("required", False) is False or bool(enc.get("active"))
        checks["token_encryption"] = {
            "ok": enc_ok,
            "mode": enc.get("mode"),
            "required": enc.get("required"),
            "active": enc.get("active"),
        }
        if not enc_ok:
            failures.append("token_encryption: required but not active")

        # 3. Persistence
        pers = _persistence_status()
        pers_ok = "error" not in pers
        checks["persistence"] = {
            "ok": pers_ok,
            "backend": pers.get("backend", "unknown"),
            "durable": pers.get("durable", False),
        }
        if not pers_ok:
            failures.append(f"persistence: {pers.get('error')}")

        # 4. Migrations
        mig_ok, mig_detail = _migrations_ok()
        checks["migrations"] = {"ok": mig_ok, "detail": mig_detail}
        if not mig_ok:
            failures.append(f"migrations: {mig_detail}")

        # 5. Scheduler ownership
        sched = _scheduler_health()
        sched_enabled = sched.get("enabled", False)
        sched_running = sched.get("running_thread", False)
        # Scheduler not running is OK when it's disabled (e.g. in tests).
        sched_ok = not sched_enabled or sched_running
        checks["scheduler"] = {
            "ok": sched_ok,
            "enabled": sched_enabled,
            "running": sched_running,
        }
        if not sched_ok:
            failures.append("scheduler: enabled but thread not running")

        overall = "ok" if not failures else "degraded"
        return {
            "status": overall,
            "check": "ready",
            "failures": failures,
            "checks": checks,
        }

    return _cached("ready", ttl, _compute)


# ── Dependency health ─────────────────────────────────────────────────────────

def deps() -> Dict[str, Any]:
    """Dependency health — readiness-state based, no live provider calls."""
    ttl = _env_int("SEO_HEALTH_CACHE_DEPS_S", 30)

    def _compute() -> Dict[str, Any]:
        from seo.ops.readiness import all_providers_readiness

        providers_state = all_providers_readiness()
        provider_summary: Dict[str, Any] = {}
        for p in providers_state:
            name = p.get("provider", "unknown")
            provider_summary[name] = {
                "configured": p.get("configured", False),
                "live_mode_enabled": p.get("live_mode_enabled", False),
                "creds_valid": p.get("creds_valid", None),
                "last_smoke": p.get("last_smoke", None),
            }

        # Persistence dep
        pers = _persistence_status()
        supabase_ok = pers.get("backend") == "supabase" and pers.get("durable", False)
        supabase_configured = False
        try:
            import persistence
            supabase_configured = persistence.supabase_configured()
        except Exception:
            pass

        # Encryption dep
        enc = _encryption_status()

        deps_result: Dict[str, Any] = {
            "supabase": {
                "configured": supabase_configured,
                "active_backend": pers.get("backend", "unknown"),
                "durable": pers.get("durable", False),
            },
            "google_oauth": provider_summary.get("google_oauth", {"configured": False}),
            "pagespeed": provider_summary.get("pagespeed", {"configured": False}),
            "seo_providers": {
                name: provider_summary[name]
                for name in ("gsc", "ga4", "keyword", "rank", "backlink", "gbp")
                if name in provider_summary
            },
            "email": provider_summary.get("email", {"configured": False}),
            "pdf_renderer": provider_summary.get("pdf", {"configured": False}),
            "token_encryption": {
                "active": enc.get("active"),
                "mode": enc.get("mode"),
                "required": enc.get("required"),
            },
        }

        # Determine overall status
        critical_ok = (
            supabase_configured or pers.get("backend") != "supabase"  # memory/file also valid
        )
        overall = "ok" if critical_ok else "degraded"

        return {
            "status": overall,
            "check": "deps",
            "dependencies": deps_result,
        }

    return _cached("deps", ttl, _compute)
