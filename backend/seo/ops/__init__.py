"""SEO operational observability package.

Modules:
  metrics   — in-process structured metrics registry (counters + histograms).
  readiness — provider readiness state without network probes.
  health    — liveness/readiness/dependency health checks.
  alerts    — operational alert definitions + evaluation.
  routes    — FastAPI router exposing /api/agents/seo/ops/* endpoints.
"""
