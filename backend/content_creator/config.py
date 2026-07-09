"""Thin config for the Content Creator service — PURE STDLIB.

The rest of the backend reads env inline via os.getenv; this module just
centralizes the handful of Content-Creator flags (and the DEMO banner) so the
mock-first / dry-run safety defaults live in one obvious place. No settings
framework, no secrets.
"""

from __future__ import annotations

import os

DEMO_BANNER = "DEMO · MOCK MODE"


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def mock_mode() -> bool:
    """True (default) → all external providers use deterministic mocks."""
    return _flag("CONTENT_CREATOR_MOCK", True)


def dry_run_posting() -> bool:
    """True (default) → posting adapters never publish live."""
    return _flag("CONTENT_CREATOR_DRY_RUN", True)


def model_mode() -> str:
    """Shared AI mode flag. 'fake' (default) keeps every AI call $0."""
    return os.getenv("PIXIE_MODEL_MODE", "fake")


def live_enabled() -> bool:
    """Live spend/posting is allowed ONLY when explicitly opted out of both
    mock_mode and dry_run (and never reached in this build's default config)."""
    return (not mock_mode()) and (not dry_run_posting())


# --------------------------------------------------------------------------- #
# Real-provider (Higgsfield) configuration
#
# Real mode is simply the inverse of mock_mode(): when CONTENT_CREATOR_MOCK is
# false the pipeline MUST talk to a real provider — it never silently falls back
# to a mock. Credentials/secrets are read here by NAME only and never returned to
# any HTTP caller. The video model id is intentionally operator-supplied
# (HIGGSFIELD_VIDEO_MODEL) because Higgsfield's model catalog is not something we
# hard-code / guess — an unset model in real mode is surfaced honestly.
# --------------------------------------------------------------------------- #
def real_mode() -> bool:
    """True → external providers must be real (mock is disabled). Inverse of mock_mode()."""
    return not mock_mode()


def provider_name() -> str:
    """Which video provider real mode targets. Only 'higgsfield' is wired."""
    return os.getenv("CONTENT_CREATOR_PROVIDER", "higgsfield").strip().lower()


def higgsfield_credential() -> str:
    """Return the Pixie-managed Higgsfield credential as the SDK's ``key:secret``
    string, or ``""`` when unset. Accepts either a single combined key
    (HIGGSFIELD_API_KEY already containing a colon, or HIGGSFIELD_KEY / HF_KEY)
    or a separate HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET pair. NEVER logged."""
    combined = (
        os.getenv("HIGGSFIELD_KEY")
        or os.getenv("HF_KEY")
        or ""
    ).strip()
    if combined:
        return combined
    key = (os.getenv("HIGGSFIELD_API_KEY") or os.getenv("HF_API_KEY") or "").strip()
    secret = (os.getenv("HIGGSFIELD_API_SECRET") or os.getenv("HF_API_SECRET") or "").strip()
    if key and secret:
        return key + ":" + secret
    # A single value that already carries the "key:secret" shape is valid on its own.
    if key and ":" in key:
        return key
    return ""


def higgsfield_video_model() -> str:
    """Operator-supplied Higgsfield model id (the SDK ``application`` path, e.g.
    ``higgsfield-ai/soul/standard``). Empty when unset — callers must surface a
    provider_not_configured / model-missing error rather than guess a catalog id."""
    return (os.getenv("HIGGSFIELD_VIDEO_MODEL") or "").strip()


def higgsfield_defaults() -> dict:
    """Tunable generation defaults (safe, overridable via env). Duration is clamped
    by the connector to a provider-supported value."""
    return {
        "aspect_ratio": os.getenv("HIGGSFIELD_ASPECT_RATIO", "9:16").strip() or "9:16",
        "resolution": os.getenv("HIGGSFIELD_RESOLUTION", "720p").strip() or "720p",
        "duration_seconds": _int_env("HIGGSFIELD_DURATION_SECONDS", 5),
    }


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return default


def higgsfield_configured() -> bool:
    """True when a Pixie-managed Higgsfield credential is present in the env.
    (Per-tenant client-supplied keys are tracked separately at connect time.)"""
    return bool(higgsfield_credential())


def provider_status() -> dict:
    """Safe, secret-free description of real-provider readiness for /status.

    Never includes key material. ``configured`` reflects whether a usable
    credential + model exist; ``connected`` is only asserted after a real
    connection test (the router fills that in from stored connection state)."""
    name = provider_name()
    configured = (not mock_mode()) and higgsfield_configured() and bool(higgsfield_video_model())
    status: dict = {
        "name": name,
        "mock_mode": mock_mode(),
        "configured": configured,
        "capabilities": {
            "video_generation": configured,
            "job_status": configured,
            "result_download": configured,
        },
    }
    if not mock_mode() and not configured:
        # Be explicit about WHY real mode isn't ready, without leaking secrets.
        missing = []
        if not higgsfield_configured():
            missing.append("HIGGSFIELD_API_KEY/HIGGSFIELD_API_SECRET")
        if not higgsfield_video_model():
            missing.append("HIGGSFIELD_VIDEO_MODEL")
        status["status"] = "provider_not_configured"
        status["missing"] = missing
    return status


def default_provider_mode() -> str:
    """Canonical default billing/provider mode for tenants that haven't chosen one.
    From CONTENT_CREATOR_DEFAULT_PROVIDER_MODE; defaults to ``pixie_managed``."""
    from content_creator.enums import canonical_provider_mode

    return canonical_provider_mode(os.getenv("CONTENT_CREATOR_DEFAULT_PROVIDER_MODE", "pixie_managed"))


def billing_block(mode: str) -> dict:
    """Billing descriptor for a canonical provider mode (safe for /status)."""
    if mode == "client_own_account":
        return {"mode": "client_credits", "requires_cost_approval": True, "markup_enabled": False}
    if mode == "prompt_export":
        return {"mode": "manual", "requires_cost_approval": False, "markup_enabled": False}
    # pixie_managed (default)
    return {"mode": "pixie_wallet", "requires_cost_approval": True, "markup_enabled": True}


def status_banner() -> dict:
    """What the demo header shows so it's always obvious we're safe."""
    return {
        "banner": DEMO_BANNER if mock_mode() else "LIVE · REAL PROVIDER",
        "mock_mode": mock_mode(),
        "dry_run_posting": dry_run_posting(),
        "model_mode": model_mode(),
        "live_enabled": live_enabled(),
    }
