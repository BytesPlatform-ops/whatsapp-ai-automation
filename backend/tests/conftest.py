"""Pytest bootstrap for the backend.

Neutralize the internal-secret gate for tests: the suite exercises the app
directly via TestClient (no proxy), so the `X-Pixie-Internal-Secret` header isn't
present. Setting the var to an empty string (present, so app._load_local_env
won't re-populate it from a local backend/.env) makes the middleware a no-op
during tests, regardless of whether a developer has a real secret in backend/.env.
"""
import os

os.environ["PIXIE_INTERNAL_API_SECRET"] = ""
