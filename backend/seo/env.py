"""Tolerant environment-variable parsing for the SEO agent.

A very common footgun: a ``.env`` line like ``SEO_SWEEPER_INTERVAL_S=`` leaves the
variable PRESENT but EMPTY. ``os.getenv(name, default)`` only returns *default*
when the key is *absent*, so an empty value flows straight into ``int("")`` /
``float("")`` and crashes startup (observed at boot in ``_start_seo_sweeper``).

These helpers treat an empty / whitespace-only (or otherwise unparseable) value
the same as "unset" (fall back to the default) while still honouring a real
``0``. This mirrors the existing local ``_env_int`` helpers in
``seo/scheduler/runtime.py`` and ``seo/ops/health.py`` (which already catch
``ValueError``/``TypeError``); it just gives the many *unguarded* call sites the
same safety.
"""
from __future__ import annotations

import os


def env_int(name: str, default: int) -> int:
    """int() an env var, treating unset/empty/unparseable as ``default``."""
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw.strip())
    except (ValueError, TypeError):
        return default


def env_float(name: str, default: float) -> float:
    """float() an env var, treating unset/empty/unparseable as ``default``."""
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw.strip())
    except (ValueError, TypeError):
        return default
