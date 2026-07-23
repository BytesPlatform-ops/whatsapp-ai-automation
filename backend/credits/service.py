"""Credit orchestration — reserve → settle / release / refund.

The one API product code calls. Every mutation is idempotent (rule 20) and writes
the ledger + reservation together so a replay never double-charges (rules 8/20).
Balance decisions read the LEDGER-derived available balance (rule 6), never a
client value. Insufficient funds block the provider call BEFORE it starts (rule 3).
"""

from __future__ import annotations

from typing import Optional, Tuple

from . import config
from .ledger import LedgerEntry, LedgerEntryType, get_ledger_repository
from .money import CURRENT_PRICING_VERSION, provider_micro_usd_to_mc
from .reservations import (
    Reservation,
    ReservationStatus,
    get_reservation_repository,
    in_seconds,
)
from .wallet import get_wallet_repository


# Reason codes for release/refund (Task 9).
REASON_VALIDATION_FAILED = "validation_failed"
REASON_PROVIDER_NOT_CONFIGURED = "provider_not_configured"
REASON_PROVIDER_REJECTED = "provider_rejected"
REASON_PROVIDER_TIMEOUT_UNBILLED = "provider_timeout_unbilled"
REASON_PROVIDER_PARTIAL_FAILURE = "provider_partial_failure"
REASON_CANCELLED_BEFORE_SUBMIT = "job_cancelled_before_submit"
REASON_DUPLICATE_REQUEST = "duplicate_request"
REASON_SYSTEM_ERROR_BEFORE_SUBMIT = "system_error_before_submit"
REASON_MANUAL_ADJUSTMENT = "manual_adjustment"
REASON_EXPIRED = "reservation_expired"


class CreditError(Exception):
    def __init__(self, code: str, message: str, http_status: int = 402, extra: Optional[dict] = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.extra = extra or {}

    def to_detail(self) -> dict:
        return {"error": self.code, "message": self.message, **self.extra}


def available_mc(tenant_id: str) -> int:
    return get_ledger_repository().balances(tenant_id)[0]


# ── grants / purchases (credit in) ──────────────────────────────────────────────
def grant(tenant_id: str, amount_mc: int, *, entry_type: LedgerEntryType = LedgerEntryType.GRANT,
          reason_code: str = "", idempotency_key: str = "", reference_type: str = "",
          reference_id: str = "", stripe_event_id: str = "", pricing_version: str = "",
          created_by: str = "") -> Tuple[str, LedgerEntry]:
    """Add spendable credits. Idempotent on ``idempotency_key`` so a replayed Stripe
    webhook never double-grants (rule 8, Task 17)."""
    if amount_mc <= 0:
        raise CreditError("bad_amount", "grant amount must be positive", 400)
    lid, entry = get_ledger_repository().append(LedgerEntry(
        tenant_id=tenant_id, entry_type=entry_type, amount_mc=amount_mc,
        reason_code=reason_code, idempotency_key=idempotency_key, reference_type=reference_type,
        reference_id=reference_id, stripe_event_id=stripe_event_id,
        pricing_version=pricing_version or CURRENT_PRICING_VERSION, created_by=created_by))
    get_wallet_repository().refresh(tenant_id)
    return lid, entry


# ── reserve (hold before a paid call) ───────────────────────────────────────────
def reserve(tenant_id: str, *, operation_type: str, source_product: str, source_object_id: str,
            max_reserved_mc: int, estimated_provider_micro_usd: int = 0, idempotency_key: str,
            pricing_version: str = "", provider_operation_id: str = "", created_by: str = "",
            ttl_seconds: int = 0) -> Tuple[str, Reservation]:
    """Place a credit hold. One user action = one reservation: a duplicate
    ``idempotency_key`` returns the EXISTING reservation (rules 8, Task 7). Blocks
    when available < max_reserved_mc (rule 3/9) unless negatives are explicitly
    allowed."""
    if max_reserved_mc <= 0:
        raise CreditError("bad_amount", "reservation amount must be positive", 400)

    resrepo = get_reservation_repository()
    existing = resrepo.find_by_idempotency(tenant_id, idempotency_key)
    if existing:
        return existing  # idempotent — never a second hold for the same action

    if not config.allow_negative_credits() and available_mc(tenant_id) < max_reserved_mc:
        raise CreditError("insufficient_credits",
                          "Not enough credits for this operation.", 402,
                          {"available_mc": available_mc(tenant_id), "required_mc": max_reserved_mc})

    pv = pricing_version or CURRENT_PRICING_VERSION
    ttl = ttl_seconds or config.reservation_ttl_seconds(operation_type)

    rid, r = resrepo.create(Reservation(
        tenant_id=tenant_id, operation_type=operation_type, source_product=source_product,
        source_object_id=source_object_id, max_reserved_mc=max_reserved_mc,
        estimated_provider_micro_usd=estimated_provider_micro_usd, pricing_version=pv,
        idempotency_key=idempotency_key, status=ReservationStatus.ACTIVE,
        provider_operation_id=provider_operation_id, created_by=created_by,
        expires_at=in_seconds(ttl)))

    # Ledger hold — idempotency key derived from the reservation id so a retry can't
    # place a second hold even if the reservation write is replayed.
    get_ledger_repository().append(LedgerEntry(
        tenant_id=tenant_id, entry_type=LedgerEntryType.RESERVATION,
        amount_mc=-max_reserved_mc, reserved_delta_mc=max_reserved_mc,
        reference_type=source_product, reference_id=source_object_id, reservation_id=rid,
        idempotency_key=f"resv:{rid}", pricing_version=pv, created_by=created_by))
    get_wallet_repository().refresh(tenant_id)
    return rid, r


def _finalized(r: Reservation) -> bool:
    return r.status in {ReservationStatus.SETTLED.value, ReservationStatus.RELEASED.value,
                        ReservationStatus.EXPIRED.value, ReservationStatus.REFUNDED.value}


# ── settle (finalize to actual cost) ────────────────────────────────────────────
def settle(tenant_id: str, reservation_id: str, *, actual_provider_micro_usd: int = 0,
           settle_mc: Optional[int] = None, apply_markup: bool = True) -> Tuple[str, Reservation]:
    """Finalize a reservation. Charges the trusted actual cost (or ``settle_mc``),
    releases the unused remainder, and NEVER deducts more than was reserved (rule 9).
    Idempotent: a replayed provider callback / worker retry returns the settled
    reservation without a second charge (rule 8, Task 8)."""
    resrepo = get_reservation_repository()
    found = resrepo.get(tenant_id, reservation_id)
    if found is None:
        raise CreditError("not_found", "reservation not found", 404)
    _, r = found
    if _finalized(r):
        return reservation_id, r  # idempotent

    if settle_mc is None:
        settle_mc = provider_micro_usd_to_mc(actual_provider_micro_usd, version=r.pricing_version,
                                             apply_markup=apply_markup)
    settle_mc = max(0, int(settle_mc))

    anomaly = ""
    if settle_mc > r.max_reserved_mc:
        # Under-reserved: charge only the authorized amount, flag for reconciliation.
        anomaly = "under_reserved"
        settle_mc = r.max_reserved_mc
    unused = r.max_reserved_mc - settle_mc

    get_ledger_repository().append(LedgerEntry(
        tenant_id=tenant_id, entry_type=LedgerEntryType.SETTLEMENT,
        amount_mc=unused, reserved_delta_mc=-r.max_reserved_mc,
        currency_amount_micro=actual_provider_micro_usd, reference_type=r.source_product,
        reference_id=r.source_object_id, reservation_id=reservation_id,
        idempotency_key=f"settle:{reservation_id}", pricing_version=r.pricing_version,
        reason_code=anomaly, metadata={"anomaly": anomaly} if anomaly else {}))
    _, updated = resrepo.update(tenant_id, reservation_id, status=ReservationStatus.SETTLED,
                                settled_mc=settle_mc, anomaly=anomaly)
    get_wallet_repository().refresh(tenant_id)
    return reservation_id, updated


# ── release (return the whole hold) ─────────────────────────────────────────────
def release(tenant_id: str, reservation_id: str, *, reason_code: str,
            status: ReservationStatus = ReservationStatus.RELEASED) -> Tuple[str, Reservation]:
    """Return the full reservation to available — used for unbilled failures /
    cancellation before submit / expiry. Idempotent."""
    resrepo = get_reservation_repository()
    found = resrepo.get(tenant_id, reservation_id)
    if found is None:
        raise CreditError("not_found", "reservation not found", 404)
    _, r = found
    if _finalized(r):
        return reservation_id, r  # idempotent

    get_ledger_repository().append(LedgerEntry(
        tenant_id=tenant_id, entry_type=LedgerEntryType.RELEASE,
        amount_mc=r.max_reserved_mc, reserved_delta_mc=-r.max_reserved_mc,
        reference_type=r.source_product, reference_id=r.source_object_id, reservation_id=reservation_id,
        idempotency_key=f"release:{reservation_id}", reason_code=reason_code,
        pricing_version=r.pricing_version))
    _, updated = resrepo.update(tenant_id, reservation_id, status=status, reason_code=reason_code)
    get_wallet_repository().refresh(tenant_id)
    return reservation_id, updated


# ── refund (compensating return after settlement) ───────────────────────────────
def refund(tenant_id: str, *, amount_mc: int, reason_code: str, reservation_id: str = "",
           original_txn_id: str = "", reference_type: str = "", reference_id: str = "",
           created_by: str = "") -> Tuple[str, LedgerEntry]:
    """Return consumed credits via a NEW compensating ledger entry (rule 4/11).
    Idempotent on the reservation+reason so a retry doesn't double-refund."""
    if amount_mc <= 0:
        raise CreditError("bad_amount", "refund amount must be positive", 400)
    key = f"refund:{reservation_id or original_txn_id}:{reason_code}"
    lid, entry = get_ledger_repository().append(LedgerEntry(
        tenant_id=tenant_id, entry_type=LedgerEntryType.REFUND, amount_mc=amount_mc,
        reservation_id=reservation_id, original_txn_id=original_txn_id, reason_code=reason_code,
        reference_type=reference_type, reference_id=reference_id, idempotency_key=key,
        created_by=created_by))
    if reservation_id:
        found = get_reservation_repository().get(tenant_id, reservation_id)
        if found:
            get_reservation_repository().update(tenant_id, reservation_id, status=ReservationStatus.REFUNDED)
    get_wallet_repository().refresh(tenant_id)
    return lid, entry
