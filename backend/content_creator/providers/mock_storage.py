"""Thin re-export so a dedicated mock_storage module exists for importers.

The implementation lives in storage.py; this keeps the symmetrical
mock_<provider> naming for callers that expect it.
"""

from __future__ import annotations

from content_creator.providers.storage import MockStorageProvider

__all__ = ["MockStorageProvider"]
