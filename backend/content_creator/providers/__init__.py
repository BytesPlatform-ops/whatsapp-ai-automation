"""Provider package — video generation + storage abstractions.

Mock-first in mock mode; a real Higgsfield connector (async job model) in real
mode with NO silent fallback. See ``base.py`` for the factory policy.
"""

from __future__ import annotations

from content_creator.providers.base import (
    HiggsfieldProvider,
    ProviderError,
    ProviderNotConfigured,
    StorageProvider,
    get_higgsfield_provider,
    get_storage_provider,
)
from content_creator.providers.mock_higgsfield import MockHiggsfieldProvider
from content_creator.providers.storage import MockStorageProvider, SupabaseStorageProvider

__all__ = [
    "HiggsfieldProvider",
    "StorageProvider",
    "ProviderError",
    "ProviderNotConfigured",
    "get_higgsfield_provider",
    "get_storage_provider",
    "MockHiggsfieldProvider",
    "MockStorageProvider",
    "SupabaseStorageProvider",
]
