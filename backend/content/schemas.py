"""ContentAsset contract."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ContentAsset(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = ""
    tenant_id: str
    uploaded_by: str = ""
    asset_type: str = "image"        # image | video | thumbnail | reel
    mime_type: str = ""
    storage_provider: str = ""       # supabase | local
    storage_path: str = ""
    public_url: str = ""
    filename: str = ""
    size_bytes: int = 0
    duration_seconds: float | None = None
    width: int | None = None
    height: int | None = None
    metadata_json: dict = Field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""

    def meta_reachable(self) -> bool:
        """True when a real Meta publish could fetch this media (public https URL)."""
        return bool(self.public_url) and self.storage_provider == "supabase" \
            and self.public_url.startswith("http")
