"""ContentAsset store + upload — durable records, bytes in storage.py."""

from __future__ import annotations

import base64
import binascii
import secrets
from datetime import datetime, timezone
from typing import Optional

import persistence
import storage

from .schemas import ContentAsset


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _asset_type(mime: str) -> str:
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("image/"):
        return "image"
    return "file"


class _Store:
    """Thin wrapper over the row repo (memory | file | supabase table content_assets)."""

    def __init__(self) -> None:
        self._repo = persistence.table("content_assets")

    def create(self, asset: ContentAsset) -> ContentAsset:
        asset.id = f"asset_{secrets.token_hex(6)}"  # unique across instances
        asset.created_at = asset.updated_at = _now()
        self._repo.upsert(persistence.envelope(asset.id, asset.tenant_id, asset.model_dump(), asset.created_at))
        return asset

    def get(self, tenant_id: str, asset_id: str) -> Optional[ContentAsset]:
        row = self._repo.get(tenant_id, asset_id)
        return ContentAsset(**row["data"]) if row else None

    def list(self, tenant_id: str) -> list[ContentAsset]:
        return [ContentAsset(**r["data"]) for r in reversed(self._repo.list_by_tenant(tenant_id))]

    def delete(self, tenant_id: str, asset_id: str) -> Optional[ContentAsset]:
        asset = self.get(tenant_id, asset_id)
        if asset:
            self._repo.delete(tenant_id, asset_id)
        return asset


_store: Optional[_Store] = None


def _get_store() -> _Store:
    global _store
    if _store is None:
        _store = _Store()
    return _store


def create_asset_from_base64(tenant_id: str, *, filename: str, content_type: str,
                             data_base64: str, uploaded_by: str = "",
                             metadata: Optional[dict] = None) -> ContentAsset:
    """Decode base64, push bytes to storage, and persist the record."""
    try:
        raw = base64.b64decode(data_base64.split(",")[-1], validate=False)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"Invalid base64 media data: {exc}") from exc
    if not raw:
        raise ValueError("Empty media upload.")

    stored = storage.upload(tenant_id, filename, raw, content_type)  # raises if not configured
    asset = ContentAsset(
        tenant_id=tenant_id, uploaded_by=uploaded_by, asset_type=_asset_type(content_type),
        mime_type=content_type, storage_provider=stored["storage_provider"],
        storage_path=stored["storage_path"], public_url=stored["public_url"],
        filename=filename, size_bytes=len(raw), metadata_json=metadata or {},
    )
    return _get_store().create(asset)


def get_asset(tenant_id: str, asset_id: str) -> Optional[ContentAsset]:
    return _get_store().get(tenant_id, asset_id)


def list_assets(tenant_id: str) -> list[ContentAsset]:
    return _get_store().list(tenant_id)


def delete_asset(tenant_id: str, asset_id: str) -> bool:
    asset = _get_store().delete(tenant_id, asset_id)
    if asset:
        storage.delete(asset.storage_provider, asset.storage_path)
        return True
    return False
