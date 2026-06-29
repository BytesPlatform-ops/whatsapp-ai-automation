"""Provider abstractions + env-gated factories — PURE STDLIB.

Two provider families:
  * HiggsfieldProvider — turns an (already locked-identity) prompt into a video
    asset reference.
  * StorageProvider — persists an asset/preview reference and hands back a URI.

The factories default to deterministic mocks. The real Higgsfield path is only
selected when an API key is present AND mock_mode() is off; even then any
construction failure degrades to the mock so the pipeline never hard-fails.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod

from content_creator.config import mock_mode


class HiggsfieldProvider(ABC):
    """Generates a (mock or real) short-form video from a locked-identity prompt."""

    name = "base"

    @abstractmethod
    def generate(self, prompt: dict, *, duration_seconds: int = 15) -> dict:
        """Return an asset dict echoing the locked-identity invariant."""
        raise NotImplementedError


class StorageProvider(ABC):
    """Persists an asset/preview reference, returning a stable URI."""

    name = "base"

    @abstractmethod
    def store(self, kind: str, ref: str) -> str:
        raise NotImplementedError


def get_higgsfield_provider() -> HiggsfieldProvider:
    """Env-gated factory.

    Real provider only when a key is present and mock_mode() is off; otherwise
    (and on any construction error) the deterministic mock.
    """
    # Imported lazily to avoid import cycles and to keep the mock path key-free.
    from content_creator.providers.mock_higgsfield import MockHiggsfieldProvider

    if os.getenv("HIGGSFIELD_API_KEY") and not mock_mode():
        try:
            from content_creator.providers.higgsfield import HiggsfieldApiProvider

            return HiggsfieldApiProvider()
        except Exception:
            return MockHiggsfieldProvider()
    return MockHiggsfieldProvider()


def get_storage_provider() -> StorageProvider:
    """Default storage is the deterministic mock."""
    from content_creator.providers.storage import MockStorageProvider

    return MockStorageProvider()
