"""Product billing enforcement — the reusable reserve → run → settle/release wrapper.

Products call ``enforce(...)`` around a real paid operation. It is a pass-through
no-op unless ``CREDIT_SYSTEM_ENABLED`` is on, so billing-disabled mode preserves ALL
current behaviour (rule 17). When enabled it:

  1. checks entitlement + usage limit (hard block only when enforcement is on),
  2. reserves the estimated max BEFORE the provider call (rules 1/2) — mock ops with
     ``MOCK_USAGE_CONSUMES_CREDITS=false`` reserve nothing (rule 15),
  3. on the caller signalling provider success, settles the trusted actual cost and
     releases the unused remainder (rules 5/12),
  4. on an unbilled failure, releases the full hold (rule 8) — but if the provider
     already delivered, it SETTLES and flags reconciliation instead of refunding
     delivered work (rule 9).

Idempotency (rules 7/14): the reservation is keyed by the operation id, so a
duplicate HTTP retry reuses the same reservation and never double-charges.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Iterator, Optional

from . import audit, config, plans, service

_log = logging.getLogger("pixie.credits")


class Operation:
    """Handle yielded to the caller. The caller MUST call ``provider_succeeded`` once
    the provider actually delivered, passing the trusted actual cost in µUSD."""

    def __init__(self, *, tenant_id: str, operation_id: str, reservation_id: str,
                 required: bool, mock: bool) -> None:
        self.tenant_id = tenant_id
        self.operation_id = operation_id
        self.reservation_id = reservation_id
        self.required = required   # a real credit hold was placed
        self.mock = mock
        self._provider_ok = False
        self._actual_micro_usd = 0
        self._settle_mc: Optional[int] = None
        self.billing_state = "not_required" if not required else "reserved"

    def provider_succeeded(self, actual_provider_micro_usd: int = 0, *, settle_mc: Optional[int] = None) -> None:
        self._provider_ok = True
        self._actual_micro_usd = max(0, int(actual_provider_micro_usd))
        self._settle_mc = settle_mc
        self.billing_state = "provider_submitted"


def _entitlement_precheck(tenant_id: str, feature: str, limit_key: str, used: int) -> None:
    if feature:
        r = plans.check_feature(tenant_id, feature)
        if not r["allowed"]:
            audit.emit(tenant_id, audit.ENTITLEMENT_DENIED, operation=feature,
                       metadata={"plan_id": r["plan_id"], "feature": feature})
            raise service.CreditError("feature_not_entitled",
                                      "Your plan doesn't include this feature.", 402,
                                      {"plan_id": r["plan_id"], "remediation": "upgrade_plan"})
    if limit_key:
        r = plans.check_limit(tenant_id, limit_key, used)
        if not r["allowed"]:
            audit.emit(tenant_id, audit.USAGE_LIMIT_REACHED, operation=limit_key,
                       metadata={"limit_key": limit_key, "limit": r["limit"], "used": r["used"]})
            raise service.CreditError("usage_limit_reached",
                                      "You've reached your plan's limit for this action.", 402,
                                      {"limit_key": limit_key, "limit": r["limit"], "used": r["used"],
                                       "remediation": "upgrade_plan"})


def precheck(tenant_id: str, *, features=(), limit_key: str = "", used: int = 0) -> None:
    """Public entitlement/limit gate for async paths (e.g. video) that reserve
    manually. No-op unless the credit system is enabled. Raises CreditError (402)."""
    if not config.credit_system_enabled():
        return
    for f in features:
        _entitlement_precheck(tenant_id, f, "", 0)
    if limit_key:
        _entitlement_precheck(tenant_id, "", limit_key, used)


@contextmanager
def enforce(tenant_id: str, *, operation_type: str, source_product: str, source_object_id: str,
            operation_id: str, estimate: dict, feature: str = "", limit_key: str = "", used: int = 0,
            is_mock: bool, byok: bool = False, provider_operation_id: str = "",
            created_by: str = "") -> Iterator[Operation]:
    max_mc = int(estimate.get("max_reservation_mc", 0))

    # Disabled → exact prior behaviour, no checks, no hold.
    if not config.credit_system_enabled():
        yield Operation(tenant_id=tenant_id, operation_id=operation_id, reservation_id="",
                        required=False, mock=is_mock)
        return

    _entitlement_precheck(tenant_id, feature, limit_key, used)

    charge_mock = is_mock and config.mock_usage_consumes_credits()
    if (is_mock and not charge_mock) or max_mc <= 0:
        # Mock (or free) op consumes zero credits — no reservation.
        yield Operation(tenant_id=tenant_id, operation_id=operation_id, reservation_id="",
                        required=False, mock=is_mock)
        return

    rid, _ = service.reserve(
        tenant_id, operation_type=operation_type, source_product=source_product,
        source_object_id=source_object_id, max_reserved_mc=max_mc,
        estimated_provider_micro_usd=int(estimate.get("estimated_provider_micro_usd", 0)),
        idempotency_key=operation_id, provider_operation_id=provider_operation_id,
        created_by=created_by)  # raises insufficient_credits BEFORE the provider call

    op = Operation(tenant_id=tenant_id, operation_id=operation_id, reservation_id=rid,
                   required=True, mock=is_mock)
    try:
        yield op
    except Exception:
        if op._provider_ok:
            # Provider delivered but post-processing failed → settle, don't refund
            # delivered work; flag for reconciliation.
            service.settle(tenant_id, rid, actual_provider_micro_usd=op._actual_micro_usd,
                           settle_mc=op._settle_mc)
            op.billing_state = "reconciliation_required"
            _log.warning("credit op %s settled but post-processing failed → reconciliation", operation_id)
        else:
            service.release(tenant_id, rid, reason_code=service.REASON_PROVIDER_REJECTED)
            op.billing_state = "released"
        raise
    else:
        if op._provider_ok:
            service.settle(tenant_id, rid, actual_provider_micro_usd=op._actual_micro_usd,
                           settle_mc=op._settle_mc)
            op.billing_state = "settled"
        else:
            # Reached here cleanly without a provider success → nothing billable.
            service.release(tenant_id, rid, reason_code=service.REASON_VALIDATION_FAILED)
            op.billing_state = "released"
