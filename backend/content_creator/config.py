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


def status_banner() -> dict:
    """What the demo header shows so it's always obvious we're safe."""
    return {
        "banner": DEMO_BANNER,
        "mock_mode": mock_mode(),
        "dry_run_posting": dry_run_posting(),
        "model_mode": model_mode(),
        "live_enabled": live_enabled(),
    }
