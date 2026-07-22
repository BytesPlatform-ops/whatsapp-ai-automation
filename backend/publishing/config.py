"""Publishing configuration — PURE STDLIB, secret-free.

Safe defaults: dry-run publishing, live disabled, worker disabled. Live is only
reachable when BOTH ``SOCIAL_PUBLISH_MODE=live`` and ``META_PUBLISH_ENABLED=true``
— there is never a silent switch between dry-run and live.
"""

from __future__ import annotations

import os


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "").strip() or default)
    except (TypeError, ValueError):
        return default


def publish_mode() -> str:
    """'dry_run' (default) | 'live'. Global default a job inherits when unspecified."""
    return (os.getenv("SOCIAL_PUBLISH_MODE", "dry_run").strip().lower() or "dry_run")


def meta_publish_enabled() -> bool:
    """Master switch for real Meta publishing. False by default."""
    return _flag("META_PUBLISH_ENABLED", False)


def live_allowed() -> bool:
    """Live publishing is allowed ONLY when explicitly enabled on both switches."""
    return publish_mode() == "live" and meta_publish_enabled()


def worker_enabled() -> bool:
    return _flag("PUBLISH_WORKER_ENABLED", False)


def poll_interval_seconds() -> int:
    return _int("PUBLISH_POLL_INTERVAL_SECONDS", 30)


def max_retries() -> int:
    return _int("PUBLISH_MAX_RETRIES", 3)


def retry_base_seconds() -> int:
    return _int("PUBLISH_RETRY_BASE_SECONDS", 30)


def lock_timeout_seconds() -> int:
    return _int("PUBLISH_LOCK_TIMEOUT_SECONDS", 300)


def default_timezone() -> str:
    return os.getenv("DEFAULT_SCHEDULING_TIMEZONE", "UTC").strip() or "UTC"


def status() -> dict:
    """Frontend-safe publishing config (no secrets)."""
    return {
        "publish_mode": publish_mode(),
        "meta_publish_enabled": meta_publish_enabled(),
        "live_allowed": live_allowed(),
        "worker_enabled": worker_enabled(),
        "default_timezone": default_timezone(),
        "max_retries": max_retries(),
    }
