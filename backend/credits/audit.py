"""Financial audit log — append-only, safe-metadata-only.

Records billing lifecycle events (reservations, settlements, releases, refunds,
grants, subscription changes, denials) for a tenant. NEVER stores provider keys,
Stripe secrets, raw webhook bodies, prompts or generated content. ``emit`` is
best-effort: an audit failure must never break a financial operation.
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import persistence
from pydantic import BaseModel, ConfigDict, Field

_log = logging.getLogger("pixie.credits.audit")

# Event types.
ESTIMATE_CREATED = "estimate_created"
ENTITLEMENT_DENIED = "entitlement_denied"
USAGE_LIMIT_REACHED = "usage_limit_reached"
INSUFFICIENT_CREDITS = "insufficient_credits"
RESERVATION_CREATED = "reservation_created"
PROVIDER_SUBMITTED = "provider_submitted"
SETTLEMENT_CREATED = "settlement_created"
RESERVATION_RELEASED = "reservation_released"
REFUND_CREATED = "refund_created"
RECONCILIATION_REQUIRED = "reconciliation_required"
RECONCILIATION_COMPLETED = "reconciliation_completed"
SUBSCRIPTION_UPDATED = "subscription_updated"
CREDITS_GRANTED = "credits_granted"
PAYMENT_FAILED = "payment_failed"
DUPLICATE_WEBHOOK_IGNORED = "duplicate_webhook_ignored"
PLAN_CHANGED = "plan_changed"
DUPLICATE_OPERATION_RETURNED = "duplicate_operation_returned"

_SECRET_HINTS = ("token", "secret", "authorization", "api_key", "apikey", "password", "sk_", "whsec_")


def _safe_meta(meta: Optional[dict]) -> dict:
    """Drop any key that looks secret-bearing; stringify values defensively."""
    out: Dict[str, Any] = {}
    for k, v in (meta or {}).items():
        kl = str(k).lower()
        if any(h in kl for h in _SECRET_HINTS):
            continue
        if isinstance(v, (int, float, bool)) or v is None:
            out[k] = v
        else:
            out[k] = str(v)[:200]
    return out


class AuditEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: str = Field(..., min_length=1)
    event_type: str
    actor: str = "system"
    product: str = ""
    operation: str = ""
    reference_type: str = ""
    reference_id: str = ""
    correlation_id: str = ""
    created_at: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AuditRepository:
    table_name = "credit_audit"

    def __init__(self) -> None:
        self._repo = persistence.table(self.table_name)

    def append(self, ev: AuditEvent) -> Tuple[str, AuditEvent]:
        aid = "audit_" + secrets.token_hex(8)
        ev = ev.model_copy(update={"created_at": ev.created_at or datetime.now(timezone.utc).isoformat(timespec="seconds")})
        self._repo.upsert(persistence.envelope(aid, ev.tenant_id, ev.model_dump(mode="json")))
        return aid, ev

    def list(self, tenant_id: str) -> List[Tuple[str, AuditEvent]]:
        return [(r["id"], AuditEvent(**r["data"])) for r in self._repo.list_by_tenant(tenant_id)]


_REPO: Optional[AuditRepository] = None


def get_audit_repository() -> AuditRepository:
    global _REPO
    if _REPO is None:
        _REPO = AuditRepository()
    return _REPO


def reset_audit_repository() -> None:
    global _REPO
    _REPO = None


def emit(tenant_id: str, event_type: str, *, actor: str = "system", product: str = "",
         operation: str = "", reference_type: str = "", reference_id: str = "",
         correlation_id: str = "", metadata: Optional[dict] = None) -> None:
    """Record one audit event. Best-effort — swallows all errors."""
    try:
        if not tenant_id:
            return
        get_audit_repository().append(AuditEvent(
            tenant_id=tenant_id, event_type=event_type, actor=actor, product=product,
            operation=operation, reference_type=reference_type, reference_id=reference_id,
            correlation_id=correlation_id or secrets.token_hex(6), metadata=_safe_meta(metadata)))
    except Exception:
        _log.debug("audit emit failed for %s/%s", tenant_id, event_type, exc_info=False)
