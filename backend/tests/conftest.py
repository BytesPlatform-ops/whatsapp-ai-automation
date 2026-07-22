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
* `PIXIE_MODEL_MODE="fake"` / `CONTENT_CREATOR_MOCK="true"` /
  `CONTENT_CREATOR_DRY_RUN="true"` — force MOCK/DRY-RUN for the whole suite so a
  developer who has real `OPENAI_API_KEY` / `HIGGSFIELD_*` in their `.env` can
  NEVER make a paid provider call or a live post during `pytest`. Tests that
  exercise the real-provider seams inject a STUB router/SDK via monkeypatch (they
  set `openai` mode per-case but never reach a real network client). Opt-in live
  smoke tests are gated separately behind `RUN_LIVE_MODEL_TESTS` /
  `RUN_LIVE_VIDEO_TESTS` (default off).
"""
import os

os.environ["PIXIE_INTERNAL_API_SECRET"] = ""
os.environ["PIXIE_PERSIST"] = "memory"
os.environ["PIXIE_MODEL_MODE"] = "fake"
os.environ["CONTENT_CREATOR_MOCK"] = "true"
os.environ["CONTENT_CREATOR_DRY_RUN"] = "true"
