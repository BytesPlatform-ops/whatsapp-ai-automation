"""seo.google — Google Search Console + GA4 integration for the Pixie SEO agent.

Sub-modules:
  crypto      — token sealing (Fernet / obfuscation fallback)
  oauth       — signed, expiring OAuth state; scope helpers
  gsc_client  — provider abstraction + Mock/Http implementations for GSC
  ga4_client  — provider abstraction + Mock/Http implementations for GA4
  connections — connect flow, health, refresh, revoke
  sync        — durable GSC + GA4 sync jobs with idempotent upsert
  routes      — FastAPI router mounted at /api/agents/seo/google/*
"""
