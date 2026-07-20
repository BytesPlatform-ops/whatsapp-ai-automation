"""Pytest bootstrap for the backend.

Neutralize env that a developer's local `backend/.env` would otherwise leak into
the suite via `app._load_local_env` (which only sets vars NOT already present, so
seeding them here wins):

* `PIXIE_INTERNAL_API_SECRET=""` — the suite drives the ASGI app directly (no
  proxy) and never sends the `X-Pixie-Internal-Secret` header, so blanking the
  secret makes the gate a no-op.
* `PIXIE_PERSIST="memory"` — keep repositories in-memory/hermetic even when the
  local `.env` selects a durable backend (`file`/`supabase`), so tests don't leak
  rows across cases through `.pixie_data`/Postgres. Tests that exercise durable
  persistence set this per-case with monkeypatch and revert it.
"""
import os

os.environ["PIXIE_INTERNAL_API_SECRET"] = ""
os.environ["PIXIE_PERSIST"] = "memory"
