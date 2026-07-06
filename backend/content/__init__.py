"""Content assets — uploaded media (image/video/reel) for Meta publishing.

Durable records (persistence.py) + bytes in storage.py (Supabase/local). The
publishing flow references a ContentAsset by id and resolves its public URL at
approve time, so Meta gets a real, fetchable URL.
"""

from .service import (
    ContentAsset,
    create_asset_from_base64,
    delete_asset,
    get_asset,
    list_assets,
)

__all__ = [
    "ContentAsset",
    "create_asset_from_base64",
    "get_asset",
    "list_assets",
    "delete_asset",
]
