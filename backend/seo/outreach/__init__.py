"""SEO Outreach vertical — contacts, campaigns, AI drafts, sending, follow-ups,
earned-link tracking.

Sub-modules:
  stores       — dataclasses + _AutoRepo repositories + ALL_REPOSITORIES
  contacts     — Contact CRUD, CSV import/export, suppression enforcement
  campaigns    — Campaign lifecycle + state transitions
  drafts       — AI email drafting + approval + version history
  sending      — Approval-gated send + rate limits + audit trail
  followups    — Durable follow-up scheduler (callable, no live loop)
  link_tracking— Earned-link verification + alert on disappearance
  routes       — FastAPI APIRouter (prefix /api/agents/seo, tag seo-outreach)
"""
