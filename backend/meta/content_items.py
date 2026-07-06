"""MetaContentItem — a record of a prepared/published Meta post (durable).

Created when an approved publish runs. status is `mock_published` in mock mode or
`published` in real mode (with the real Meta id). Also records a light
ToolExecution so the execution history survives restart.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

import persistence


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class MetaContentItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = ""
    tenant_id: str
    asset_id: str = ""              # the IG/Page id published to
    platform: str = ""
    content_type: str = ""
    media_asset_id: str = ""
    meta_post_id: str = ""
    meta_media_id: str = ""
    caption: str = ""
    permalink: str = ""
    status: str = "mock_published"  # mock_published | published | failed
    published_at: str = ""
    metrics_json: dict = Field(default_factory=dict)
    created_at: str = ""


class ToolExecution(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = ""
    tenant_id: str
    approval_id: str = ""
    agent_slug: str = "marketing-agent"
    provider: str = "meta"
    capability: str = ""
    asset_id: str = ""
    status: str = ""
    error: str = ""
    output_payload: dict = Field(default_factory=dict)
    created_at: str = ""


class _Store:
    """Row repos: meta_content_items + tool_executions (memory | file | supabase)."""

    def __init__(self) -> None:
        self._content = persistence.table("meta_content_items")
        self._execs = persistence.table("tool_executions")

    def record(self, content: MetaContentItem, execution: ToolExecution) -> MetaContentItem:
        rid = secrets.token_hex(6)  # unique across instances
        content.id = f"mci_{rid}"
        content.created_at = content.published_at = _now()
        execution.id = f"te_{rid}"
        execution.created_at = _now()
        self._content.upsert(persistence.envelope(content.id, content.tenant_id, content.model_dump()))
        self._execs.upsert(persistence.envelope(execution.id, execution.tenant_id, execution.model_dump()))
        return content

    def list_content(self, tenant_id: str) -> list[MetaContentItem]:
        return [MetaContentItem(**r["data"]) for r in reversed(self._content.list_by_tenant(tenant_id))]

    def list_execs(self, tenant_id: str) -> list[ToolExecution]:
        return [ToolExecution(**r["data"]) for r in reversed(self._execs.list_by_tenant(tenant_id))]


_store: Optional[_Store] = None


def get_content_store() -> _Store:
    global _store
    if _store is None:
        _store = _Store()
    return _store
