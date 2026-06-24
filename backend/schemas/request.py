"""The inbound `Request` — a plain-language message plus routing context.

The firewall annotates a request with `billing_class` / scope before any
expensive work; the orchestrator reads `mode` + `site_id` to decide build vs
edit. User-supplied text is UNTRUSTED (prompt-injection aware downstream).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RequestMode(str, Enum):
    """What the user wants. CREATE = new site, EDIT = change an existing one.
    AUTO lets the orchestrator infer from presence of `site_id` + intent."""

    AUTO = "auto"
    CREATE = "create"
    EDIT = "edit"


class BillingClass(str, Enum):
    """Set by the firewall. BLOCKED short-circuits before any model spend."""

    FREE = "free"
    STANDARD = "standard"
    PREMIUM = "premium"
    BLOCKED = "blocked"


class Request(BaseModel):
    """A single inbound user request to build or edit a site."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tenant_id: str = Field(..., description="Owning tenant — scopes quota, RAG, and produced rows.")
    message: str = Field(..., min_length=1, max_length=8000, description="Untrusted plain-language instruction.")

    mode: RequestMode = RequestMode.AUTO
    site_id: str | None = Field(default=None, description="Target site for edits; None for a fresh build.")
    locale: str | None = Field(default=None, description="Optional locale hint (BCP-47).")

    # Populated by the firewall; not trusted from the client.
    billing_class: BillingClass | None = None

    created_at: datetime = Field(default_factory=_utcnow)
