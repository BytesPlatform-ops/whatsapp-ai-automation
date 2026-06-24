"""Industry knowledge base — per-industry DEFAULTS as cached data (no AI).

The Brain reads the matching preset before reasoning, so it starts from real
industry priors (pain points, campaign types, offers, compliance warnings)
instead of guessing. This is deterministic, reusable, and free — exactly the
kind of repetitive knowledge that must NOT cost a model call.
"""

from __future__ import annotations

from .presets import IndustryPreset, get_preset, list_presets

__all__ = ["IndustryPreset", "get_preset", "list_presets"]
