"""Storage providers for finished media.

* ``MockStorageProvider`` — deterministic, offline. ``store`` returns a stable
  ``mock://`` URI; ``store_bytes`` echoes one too (no bucket, no bytes persisted).
* ``SupabaseStorageProvider`` — real. Re-hosts the finished video in the shared
  backend Supabase bucket by delegating to ``backend/storage.py`` (service-role
  upload → public URL Meta can fetch). We re-host rather than trust the provider's
  temporary result URL. If storage isn't configured it raises honestly (via the
  backend module) rather than faking a URL.
"""

from __future__ import annotations

import hashlib

from content_creator.providers.base import StorageProvider


class MockStorageProvider(StorageProvider):
    name = "mock"

    def store(self, kind: str, ref: str) -> str:
        digest = hashlib.sha1(str(ref).encode("utf-8")).hexdigest()[:12]
        return "mock://%s/%s" % (kind, digest)

    def store_bytes(self, tenant_id: str, filename: str, content: bytes, content_type: str) -> dict:
        digest = hashlib.sha1(
            (str(tenant_id) + "|" + str(filename)).encode("utf-8")
        ).hexdigest()[:12]
        return {
            "storage_provider": "mock",
            "storage_path": "%s/%s" % (tenant_id, filename or digest),
            "storage_url": "mock://video/%s" % digest,
        }


class SupabaseStorageProvider(StorageProvider):
    """Real re-hosting via the shared backend Supabase storage module."""

    name = "supabase"

    def store(self, kind: str, ref: str) -> str:
        # Ref-only storage isn't meaningful for real re-hosting; callers on the
        # real path use store_bytes. Keep a stable, honest sentinel.
        digest = hashlib.sha1(str(ref).encode("utf-8")).hexdigest()[:12]
        return "supabase-ref://%s/%s" % (kind, digest)

    def store_bytes(self, tenant_id: str, filename: str, content: bytes, content_type: str) -> dict:
        # Import lazily so this module stays importable without httpx/env at parse
        # time; ``storage`` lives at the backend root (a sibling package).
        import storage as backend_storage

        result = backend_storage.upload(
            tenant_id=tenant_id,
            filename=filename or "video.mp4",
            content=content,
            content_type=content_type or "video/mp4",
        )
        return {
            "storage_provider": result.get("storage_provider", "supabase"),
            "storage_path": result.get("storage_path", ""),
            "storage_url": result.get("public_url", ""),
        }
