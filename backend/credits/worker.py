"""Credit reconciliation worker — recover expired/abandoned reservations safely.

Reservations hold credits for an in-flight op. If the op is abandoned (crash, lost
callback) the hold must be returned; if it actually completed, it must be settled.
``reconcile_expired`` scans ACTIVE reservations past their TTL and resolves each via
a pluggable provider resolver so this module never hard-depends on content/publishing:

  * completed        → settle to the trusted cost (once)
  * failed_unbilled  → release the full hold (once)
  * pending          → still running (long video) — preserve, extend the TTL
  * abandoned        → release as EXPIRED (default when the op can't be found)

Safety: only ACTIVE reservations are selected and ``service.settle``/``release`` are
idempotent + move to terminal states, so duplicate ticks and multiple workers never
double-settle or double-refund (Task 10). Durable persistence survives restart.
"""

from __future__ import annotations

import logging
from typing import Callable, Optional

from . import config, service
from .reservations import Reservation, ReservationStatus, get_reservation_repository, in_seconds

_log = logging.getLogger("pixie.credits")

# resolver(tenant_id, reservation) -> dict:
#   {"state": "completed"|"failed_unbilled"|"pending"|"abandoned",
#    "settle_mc": int (for completed), "actual_micro_usd": int (optional)}
ProviderResolver = Callable[[str, Reservation], dict]


def _default_resolver(tenant_id: str, r: Reservation) -> dict:
    """No provider linkage → treat an expired hold as abandoned (safe: release)."""
    return {"state": "abandoned"}


def reconcile_expired(worker_id: str = "credit-reconciler", *,
                      resolver: Optional[ProviderResolver] = None,
                      pending_extend_seconds: int = 0) -> dict:
    resolve = resolver or _default_resolver
    resrepo = get_reservation_repository()
    processed = []
    for rid, r in resrepo.active_expired():
        try:
            outcome = resolve(r.tenant_id, r)
        except Exception:  # a resolver failure must not strand or wrongly release funds
            _log.exception("credit resolver failed for reservation %s", rid)
            processed.append({"reservation_id": rid, "result": "resolver_error"})
            continue

        state = outcome.get("state", "abandoned")
        if state == "completed":
            service.settle(r.tenant_id, rid, settle_mc=outcome.get("settle_mc"),
                           actual_provider_micro_usd=outcome.get("actual_micro_usd", 0))
            result = "settled"
        elif state == "failed_unbilled":
            service.release(r.tenant_id, rid, reason_code=service.REASON_PROVIDER_TIMEOUT_UNBILLED)
            result = "released_unbilled"
        elif state == "pending":
            # Long-running (e.g. video) still valid — preserve the hold, push the TTL out.
            extend = pending_extend_seconds or config.reservation_ttl_seconds(r.operation_type)
            resrepo.update(r.tenant_id, rid, expires_at=in_seconds(extend))
            result = "preserved"
        else:  # abandoned / unknown
            service.release(r.tenant_id, rid, reason_code=service.REASON_EXPIRED,
                            status=ReservationStatus.EXPIRED)
            result = "expired_released"
        processed.append({"reservation_id": rid, "result": result})

    if processed:
        _log.info("[credits] reconciled %d expired reservation(s)", len(processed))
    return {"worker": worker_id, "processed": processed, "count": len(processed)}
