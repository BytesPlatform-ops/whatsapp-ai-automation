"""Pixie AI Content Creator — backend-only, mock-first service.

A 13-stage pipeline (intake → influencer → provider → ideas → script → cost →
video → quality → posting → analytics) with 4 owner-approval gates, modeled on
the Nico Pier pipeline. Multi-tenant: every record is tenant-scoped.

Design rules (see backend/CLAUDE.md conventions, mirrored from marketing/seo):
* Core pipeline is pure-stdlib + deterministic (no third-party imports) so it
  runs and tests with zero infra. Pydantic lives only at the HTTP boundary
  (schemas.py / demo).
* Mock-first: every external provider has a deterministic mock fallback; nothing
  spends or posts live. dry-run posting by default; no spend before Gate 3.
* AI only where allowed (idea/score/script/quality-review/learning) via the
  shared model layer (PIXIE_MODEL_MODE=fake → $0), never for scraping, cost,
  prompt assembly, scheduling, posting, metrics, dedup, or gate transitions.
"""
