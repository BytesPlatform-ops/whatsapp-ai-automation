"""Pixie Lab feed service — deterministic proactive recommendation engine.

Rules FIRST (no AI, no network): a signal collector reads a tenant's business
state and a small rules engine emits FeedCards. Omni AI (ranking/copy) lands
later and only ever ranks/rewrites — it never executes risky actions.

Self-contained (mirrors backend/seo, backend/channels): one `include_router`
line in app.py wires `/api/feed`.
"""
