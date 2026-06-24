"""`UsageEvent` — the append-only telemetry + billing record.

Exactly one event is emitted per model call (and per firewall/RAG step worth
metering). Rows are immutable and tenant-scoped; billing and cost-per-site
analytics read from this table. Logging `tokens`/`latency`/`cost` on every call
is how we always know cost-per-request.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from .request import BillingClass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UsageEventType(str, Enum):
    """What kind of metered step produced this event."""

    FIREWALL = "firewall"
    CLASSIFY = "classify"
    BUILD = "build"
    EDIT = "edit"
    EMBED = "embed"
    RAG_QUERY = "rag_query"
    QUALITY = "quality"


class ModelTier(str, Enum):
    """Which size class served the call — drives routing + cost expectations."""

    SMALL = "small"
    LARGE = "large"
    EMBED = "embed"
    NONE = "none"  # step ran without a model (e.g. rule-based firewall hit)


class UsageEvent(BaseModel):
    """Append-only usage/billing record for one metered step."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tenant_id: str = Field(..., description="Owning tenant — scopes quota + billing.")
    request_id: str | None = Field(default=None, description="The Request this step served.")
    site_id: str | None = None

    event_type: UsageEventType
    model: str | None = Field(default=None, description="Concrete model id, e.g. 'gpt-5.4-nano'. None if no model.")
    tier: ModelTier = ModelTier.NONE

    tokens_in: int = Field(default=0, ge=0)
    tokens_out: int = Field(default=0, ge=0)
    latency_ms: int = Field(default=0, ge=0)
    cost_usd: float = Field(default=0.0, ge=0.0)

    billing_class: BillingClass | None = None
    success: bool = True
    error: str | None = None

    created_at: datetime = Field(default_factory=_utcnow)
