"""SEO Backlinks vertical package.

Provides durable, tenant-scoped backlink analysis:
  - Provider abstraction (Mock + Http) for backlink data ingestion
  - Idempotent paginated sync with referring-domain aggregation
  - Transparent risk-signal analysis (no black-box AI labelling)
  - Backlink gap and opportunity engine vs competitor domains
  - FastAPI routes under /api/agents/seo/backlinks/*

Submodules:
  stores   — dataclasses + _AutoRepo repositories + singletons
  provider — BacklinkProvider abstraction + Mock/Http implementations
  service  — durable sync, profile views, velocity, anchor distribution
  risk     — explainable toxic-link risk signals
  gaps     — backlink gap analysis + outreach opportunity scoring
  routes   — FastAPI router
"""

from __future__ import annotations
