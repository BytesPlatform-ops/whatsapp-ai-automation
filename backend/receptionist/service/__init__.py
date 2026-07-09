"""Durable AI Receptionist service — the comprehensive brain + records layer.

This package is the modern, durable receptionist. It sits alongside the two
older slices (live-chat `receptionist/api.py` and the approval agent
`receptionist/agent.py`) without disturbing them, and adds:

  - a brain (`classifier.py`) that turns a customer message into an intent + a
    typed action + extracted fields (real LLM via `models/`, deterministic
    fallback so fake mode stays $0 and never raises),
  - 17 action handlers (`handlers/`) that create durable records,
  - durable, tenant-scoped stores (`stores.py`) over the shared
    `persistence.table()` layer (memory | file | supabase),
  - provider abstractions (`../providers/`) for payment/SMS/voice/notify/webhooks
    that degrade gracefully when credentials are missing,
  - an orchestration engine (`engine.py`) that ties it together.

The HTTP surface lives in `receptionist/console_api.py`.
"""
