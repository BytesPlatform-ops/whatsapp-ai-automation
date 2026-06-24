"""Mode-A SEO injection layer (deterministic, offline-safe)."""

from __future__ import annotations

from .injector import enrich_site
from .schema_builder import build_schema

__all__ = ["enrich_site", "build_schema"]
