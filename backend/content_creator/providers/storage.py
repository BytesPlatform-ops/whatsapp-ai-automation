"""Deterministic mock storage provider — PURE STDLIB.

store(kind, ref) returns a stable "mock://<kind>/<sha1[:12]>" URI so the same
reference always resolves to the same URI (no network, no real bucket).
"""

from __future__ import annotations

import hashlib

from content_creator.providers.base import StorageProvider


class MockStorageProvider(StorageProvider):
    name = "mock"

    def store(self, kind: str, ref: str) -> str:
        digest = hashlib.sha1(str(ref).encode("utf-8")).hexdigest()[:12]
        return "mock://%s/%s" % (kind, digest)
