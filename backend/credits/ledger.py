"""Immutable, workspace-scoped credit ledger — the financial source of truth.

Append-only (rules 1/4/5/19): entries are never updated or deleted; a reversal is a
NEW compensating entry. Each entry carries two signed integer deltas so both
balances are pure projections of the log:

  * ``amount_mc``          — change to **available** credits (spendable)
  * ``reserved_delta_mc``  — change to **reserved** credits (held for an in-flight op)

  available = Σ amount_mc
  reserved  = Σ reserved_delta_mc
  owned     = available + reserved

Idempotency (rule 20): ``(tenant_id, idempotency_key)`` is unique — a replay returns
the EXISTING entry instead of writing a second one, so no duplicated grant/charge.
No secret is ever stored on an entry.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import persistence
from pydantic import BaseModel, ConfigDict, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _id() -> str:
    return "ledg_" + secrets.token_hex(8)


class LedgerEntryType(str, Enum):
    GRANT = "grant"                      # plan-included credits granted
    PURCHASE = "purchase"                # credits bought (Stripe)
    RESERVATION = "reservation"          # hold credits for an in-flight operation
    SETTLEMENT = "settlement"            # finalize a reservation to actual cost
    RELEASE = "release"                  # return unused/aborted reserved credits
    REFUND = "refund"                    # compensating return of consumed credits
    ADJUSTMENT = "adjustment"            # audited manual admin correction
    EXPIRATION = "expiration"            # credits expired at period end
    MONTHLY_RESET = "monthly_reset"      # period rollover grant/reset
    PROMOTIONAL_CREDIT = "promotional_credit"
    MIGRATION = "migration"              # opening balance from an import
    CHARGEBACK = "chargeback"            # Stripe dispute reversal


# Types that add spendable credits (must have amount_mc >= 0).
_POSITIVE_ONLY = {LedgerEntryType.GRANT, LedgerEntryType.PURCHASE, LedgerEntryType.PROMOTIONAL_CREDIT,
                  LedgerEntryType.MONTHLY_RESET, LedgerEntryType.MIGRATION}


class LedgerEntry(BaseModel):
    model_config = ConfigDict(extra="ignore", use_enum_values=True)

    tenant_id: str = Field(..., min_length=1)
    entry_type: LedgerEntryType
    amount_mc: int = 0                   # signed Δ available (milli-credits)
    reserved_delta_mc: int = 0           # signed Δ reserved (milli-credits)

    currency_amount_micro: int = 0       # provider/stripe amount in µUSD (0 if n/a)
    currency: str = "usd"

    reference_type: str = ""             # e.g. content_agent | influencer_video | stripe_invoice
    reference_id: str = ""
    idempotency_key: str = ""            # unique per tenant
    reservation_id: str = ""             # linked reservation, when relevant
    original_txn_id: str = ""            # entry this one compensates (refund/release)
    reason_code: str = ""
    pricing_version: str = ""
    stripe_event_id: str = ""
    provider_operation_id: str = ""
    created_by: str = ""
    created_at: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)  # NEVER secrets


class LedgerError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class LedgerRepository:
    """Append-only. Exposes NO update or delete — reversal is a compensating entry."""

    table_name = "credit_ledger"

    def __init__(self) -> None:
        self._repo = persistence.table(self.table_name)

    def _build(self, row: Optional[dict]) -> Optional[LedgerEntry]:
        return LedgerEntry(**row["data"]) if row else None

    def find_by_idempotency(self, tenant_id: str, key: str) -> Optional[Tuple[str, LedgerEntry]]:
        if not key:
            return None
        for row in self._repo.list_by_tenant(tenant_id):
            m = self._build(row)
            if m and m.idempotency_key == key:
                return row["id"], m
        return None

    def append(self, entry: LedgerEntry) -> Tuple[str, LedgerEntry]:
        """Insert one entry. Idempotent on ``(tenant_id, idempotency_key)``: a replay
        returns the already-stored entry unchanged. Validates sign invariants."""
        if entry.entry_type in _POSITIVE_ONLY and entry.amount_mc < 0:
            raise LedgerError("bad_sign", f"{entry.entry_type} must not reduce available credits")

        if entry.idempotency_key:
            existing = self.find_by_idempotency(entry.tenant_id, entry.idempotency_key)
            if existing:
                return existing  # replay → same entry, no duplicate write

        row_id = _id()
        entry = entry.model_copy(update={"created_at": entry.created_at or now_iso()})
        self._repo.upsert(persistence.envelope(row_id, entry.tenant_id, entry.model_dump(mode="json")))
        return row_id, entry

    def get(self, tenant_id: str, entry_id: str) -> Optional[Tuple[str, LedgerEntry]]:
        m = self._build(self._repo.get(tenant_id, entry_id))
        return (entry_id, m) if m else None

    def list(self, tenant_id: str) -> List[Tuple[str, LedgerEntry]]:
        return [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]

    def balances(self, tenant_id: str) -> Tuple[int, int]:
        """Authoritative (available_mc, reserved_mc) derived from the whole log."""
        available = reserved = 0
        for _i, e in self.list(tenant_id):
            if not e:
                continue
            available += e.amount_mc
            reserved += e.reserved_delta_mc
        return available, reserved


# ── singleton + reset (mirrors publishing.store) ────────────────────────────────
_REPO: Optional[LedgerRepository] = None


def get_ledger_repository() -> LedgerRepository:
    global _REPO
    if _REPO is None:
        _REPO = LedgerRepository()
    return _REPO


def reset_ledger_repository() -> None:
    global _REPO
    _REPO = None
