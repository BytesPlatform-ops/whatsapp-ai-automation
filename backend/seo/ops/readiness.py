"""Provider readiness state for the SEO ops layer.

Detects configured-ness and persists last-smoke results in memory (no secrets).

For each provider exposes:
  - configured: bool — env vars / creds are present (no network check)
  - creds_present: bool — alias for configured
  - creds_valid: bool | None — from last smoke test (None if never run)
  - last_smoke: str | None — ISO timestamp of last smoke test
  - last_success: str | None — ISO timestamp of last successful smoke
  - last_failure: str | None — ISO timestamp of last failure
  - latency_ms: float | None — latency from last smoke
  - quota_ok: bool | None — from last smoke (None if unknown)
  - oauth_redirect_valid: bool — redirect URI present for OAuth providers
  - token_encryption_active: bool — from seo.google.crypto
  - live_mode_enabled: bool — whether the provider is in live (non-mock) mode

NEVER reveals credential values. All detection is env-only (no network calls).

Covered providers:
  google_oauth, gsc, ga4, pagespeed, keyword, rank, backlink, gbp, email, pdf
"""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# ── In-memory store for last-smoke results ────────────────────────────────────

_store_lock = threading.Lock()
_smoke_store: Dict[str, Dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


# ── Env helpers ───────────────────────────────────────────────────────────────

def _env(name: str) -> str:
    return os.getenv(name, "").strip()


def _has(*names: str) -> bool:
    """True when ALL of the given env vars are non-empty."""
    return all(_env(n) for n in names)


def _any(*names: str) -> bool:
    """True when ANY of the given env vars is non-empty."""
    return any(_env(n) for n in names)


# ── Encryption status (no network) ────────────────────────────────────────────

def _encryption_status() -> Dict[str, Any]:
    try:
        from seo.google.crypto import encryption_status
        return encryption_status()
    except Exception:
        return {"active": None, "mode": "unknown", "required": False}


# ── Provider detection (env-only, no network) ────────────────────────────────

def _google_oauth_readiness() -> Dict[str, Any]:
    configured = _has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
    redirect = _env("GOOGLE_OAUTH_REDIRECT_SEO")
    enc = _encryption_status()
    return {
        "provider": "google_oauth",
        "configured": configured,
        "creds_present": configured,
        "oauth_redirect_valid": bool(redirect),
        "token_encryption_active": bool(enc.get("active")),
        "live_mode_enabled": configured,
    }


def _gsc_readiness() -> Dict[str, Any]:
    # GSC reuses Google OAuth creds + optional service account
    configured = _has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
    sa = _env("GOOGLE_SERVICE_ACCOUNT_JSON")
    live = configured or bool(sa)
    return {
        "provider": "gsc",
        "configured": live,
        "creds_present": live,
        "oauth_redirect_valid": bool(_env("GOOGLE_OAUTH_REDIRECT_SEO")),
        "token_encryption_active": bool(_encryption_status().get("active")),
        "live_mode_enabled": live,
    }


def _ga4_readiness() -> Dict[str, Any]:
    configured = _has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
    sa = _env("GOOGLE_SERVICE_ACCOUNT_JSON")
    live = configured or bool(sa)
    return {
        "provider": "ga4",
        "configured": live,
        "creds_present": live,
        "oauth_redirect_valid": bool(_env("GOOGLE_OAUTH_REDIRECT_SEO")),
        "token_encryption_active": bool(_encryption_status().get("active")),
        "live_mode_enabled": live,
    }


def _pagespeed_readiness() -> Dict[str, Any]:
    # PageSpeed Insights: PAGESPEED_API_KEY optional (free tier works without it)
    key = _env("PAGESPEED_API_KEY")
    has_key = bool(key)
    return {
        "provider": "pagespeed",
        "configured": True,  # free tier is always available
        "creds_present": has_key,
        "api_key_present": has_key,
        "token_encryption_active": None,
        "oauth_redirect_valid": None,
        "live_mode_enabled": True,  # always callable; key just raises quota limit
    }


def _keyword_readiness() -> Dict[str, Any]:
    has_creds = _has("DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD") or bool(_env("KEYWORD_API_KEY"))
    return {
        "provider": "keyword",
        "configured": has_creds,
        "creds_present": has_creds,
        "token_encryption_active": None,
        "oauth_redirect_valid": None,
        "live_mode_enabled": has_creds,
    }


def _rank_readiness() -> Dict[str, Any]:
    has_creds = bool(_env("SERP_API_KEY") or _env("RANK_API_KEY")
                     or (_env("DATAFORSEO_LOGIN") and _env("DATAFORSEO_PASSWORD")))
    return {
        "provider": "rank",
        "configured": has_creds,
        "creds_present": has_creds,
        "token_encryption_active": None,
        "oauth_redirect_valid": None,
        "live_mode_enabled": has_creds,
    }


def _backlink_readiness() -> Dict[str, Any]:
    has_creds = bool(
        _env("SEO_BACKLINK_API_KEY")
        or (_env("DATAFORSEO_LOGIN") and _env("DATAFORSEO_PASSWORD"))
    )
    return {
        "provider": "backlink",
        "configured": has_creds,
        "creds_present": has_creds,
        "token_encryption_active": None,
        "oauth_redirect_valid": None,
        "live_mode_enabled": has_creds,
    }


def _gbp_readiness() -> Dict[str, Any]:
    configured = _has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
    redirect = _env("GBP_OAUTH_REDIRECT")
    enc = _encryption_status()
    return {
        "provider": "gbp",
        "configured": configured,
        "creds_present": configured,
        "oauth_redirect_valid": bool(redirect),
        "token_encryption_active": bool(enc.get("active")),
        "live_mode_enabled": configured,
    }


def _email_readiness() -> Dict[str, Any]:
    has_key = bool(_env("EMAIL_PROVIDER_API_KEY"))
    has_to = bool(_env("AI_RECEPTIONIST_TEAM_EMAIL"))
    configured = has_key and has_to
    return {
        "provider": "email",
        "configured": configured,
        "creds_present": has_key,
        "team_email_configured": has_to,
        "token_encryption_active": None,
        "oauth_redirect_valid": None,
        "live_mode_enabled": configured,
    }


def _pdf_readiness() -> Dict[str, Any]:
    try:
        import reportlab  # noqa: F401
        available = True
    except ImportError:
        available = False
    return {
        "provider": "pdf",
        "configured": available,
        "creds_present": available,
        "renderer": "reportlab" if available else "unavailable",
        "token_encryption_active": None,
        "oauth_redirect_valid": None,
        "live_mode_enabled": available,
    }


# ── Static detection map ──────────────────────────────────────────────────────

_PROVIDER_DETECTORS = {
    "google_oauth": _google_oauth_readiness,
    "gsc": _gsc_readiness,
    "ga4": _ga4_readiness,
    "pagespeed": _pagespeed_readiness,
    "keyword": _keyword_readiness,
    "rank": _rank_readiness,
    "backlink": _backlink_readiness,
    "gbp": _gbp_readiness,
    "email": _email_readiness,
    "pdf": _pdf_readiness,
}


# ── Public API ────────────────────────────────────────────────────────────────

def get_provider_readiness(provider: str) -> Dict[str, Any]:
    """Return readiness state for a single provider (no network calls)."""
    detector = _PROVIDER_DETECTORS.get(provider)
    if detector is None:
        return {"provider": provider, "configured": False, "error": "unknown_provider"}

    base = detector()

    # Merge in any persisted smoke-test results
    with _store_lock:
        stored = dict(_smoke_store.get(provider, {}))

    base["creds_valid"] = stored.get("creds_valid", None)
    base["last_smoke"] = stored.get("last_smoke", None)
    base["last_success"] = stored.get("last_success", None)
    base["last_failure"] = stored.get("last_failure", None)
    base["latency_ms"] = stored.get("latency_ms", None)
    base["quota_ok"] = stored.get("quota_ok", None)

    return base


def all_providers_readiness() -> List[Dict[str, Any]]:
    """Return readiness state for all known providers."""
    return [get_provider_readiness(p) for p in _PROVIDER_DETECTORS]


def record_smoke_result(
    provider: str,
    *,
    success: bool,
    latency_ms: Optional[float] = None,
    quota_ok: Optional[bool] = None,
) -> None:
    """Persist the result of a smoke test run (no secrets stored).

    Called by the smoke CLI (seo_smoke.py) after each probe.
    """
    now = _now_iso()
    with _store_lock:
        prev = dict(_smoke_store.get(provider, {}))
        prev["creds_valid"] = success
        prev["last_smoke"] = now
        prev["latency_ms"] = latency_ms
        prev["quota_ok"] = quota_ok
        if success:
            prev["last_success"] = now
        else:
            prev["last_failure"] = now
        _smoke_store[provider] = prev


def reset_smoke_store() -> None:
    """Clear all persisted smoke results. Test use only."""
    with _store_lock:
        _smoke_store.clear()
