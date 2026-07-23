"""Credit wallet — a projection of the immutable ledger.

The ledger is the source of truth; ``project(tenant)`` derives the wallet from it in
one pass, so a financial decision (can this workspace afford X?) is ALWAYS taken
against ledger-true numbers — a stale cache can never cause an overspend.

A cached ``Wallet`` row is kept for fast reads and to make drift observable:
``reconcile(tenant)`` compares the cache to the ledger and REPORTS divergence; it
only rewrites the cache when ``repair=True`` (rule 6 in Task 6 — no silent mutation
of financial state). ``refresh`` recomputes and stores the cache after a ledger write.
"""

from __future__ import annotations

from typing import Optional, Tuple

import persistence
from pydantic import BaseModel, ConfigDict, Field

from .ledger import LedgerEntryType, get_ledger_repository, now_iso

_GRANT_TYPES = {LedgerEntryType.GRANT.value, LedgerEntryType.MONTHLY_RESET.value,
                LedgerEntryType.PROMOTIONAL_CREDIT.value, LedgerEntryType.MIGRATION.value}


class Wallet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: str
    available_mc: int = 0
    reserved_mc: int = 0
    lifetime_granted_mc: int = 0
    lifetime_purchased_mc: int = 0
    lifetime_consumed_mc: int = 0
    lifetime_refunded_mc: int = 0
    plan_id: str = ""
    period_start: str = ""
    period_end: str = ""
    updated_at: str = ""
    ledger_checkpoint: int = 0   # number of ledger entries folded in


def project(tenant_id: str) -> Wallet:
    """Compute the wallet from the whole ledger. Authoritative + deterministic."""
    entries = [e for _i, e in get_ledger_repository().list(tenant_id) if e]
    w = Wallet(tenant_id=tenant_id, ledger_checkpoint=len(entries), updated_at=now_iso())
    for e in entries:
        w.available_mc += e.amount_mc
        w.reserved_mc += e.reserved_delta_mc
        t = e.entry_type if isinstance(e.entry_type, str) else e.entry_type.value
        if t in _GRANT_TYPES and e.amount_mc > 0:
            w.lifetime_granted_mc += e.amount_mc
        elif t == LedgerEntryType.PURCHASE.value and e.amount_mc > 0:
            w.lifetime_purchased_mc += e.amount_mc
        elif t == LedgerEntryType.SETTLEMENT.value:
            # consumed = reserved released − unused returned = -reserved_delta - amount
            w.lifetime_consumed_mc += (-e.reserved_delta_mc) - e.amount_mc
        elif t == LedgerEntryType.REFUND.value and e.amount_mc > 0:
            w.lifetime_refunded_mc += e.amount_mc
    return w


class WalletRepository:
    table_name = "credit_wallet"

    def __init__(self) -> None:
        self._repo = persistence.table(self.table_name)

    def get_cached(self, tenant_id: str) -> Optional[Wallet]:
        row = self._repo.get(tenant_id, tenant_id)  # one wallet per tenant, id == tenant
        return Wallet(**row["data"]) if row else None

    def refresh(self, tenant_id: str, *, plan_id: str = "", period_start: str = "",
                period_end: str = "") -> Wallet:
        """Recompute from the ledger and store the cache. Called after ledger writes."""
        w = project(tenant_id)
        cached = self.get_cached(tenant_id)
        # preserve plan/period unless explicitly provided
        w.plan_id = plan_id or (cached.plan_id if cached else "")
        w.period_start = period_start or (cached.period_start if cached else "")
        w.period_end = period_end or (cached.period_end if cached else "")
        self._repo.upsert(persistence.envelope(tenant_id, tenant_id, w.model_dump(mode="json")))
        return w

    def set_plan_period(self, tenant_id: str, *, plan_id: str, period_start: str, period_end: str) -> Wallet:
        return self.refresh(tenant_id, plan_id=plan_id, period_start=period_start, period_end=period_end)

    def reconcile(self, tenant_id: str, *, repair: bool = False) -> dict:
        """Compare cached wallet to the ledger-derived truth. Reports divergence;
        rewrites the cache only in repair mode. Never invents a ledger event."""
        truth = project(tenant_id)
        cached = self.get_cached(tenant_id)
        diverged = (cached is None or cached.available_mc != truth.available_mc
                    or cached.reserved_mc != truth.reserved_mc)
        report = {
            "tenant_id": tenant_id,
            "diverged": diverged,
            "cached_available_mc": cached.available_mc if cached else None,
            "ledger_available_mc": truth.available_mc,
            "cached_reserved_mc": cached.reserved_mc if cached else None,
            "ledger_reserved_mc": truth.reserved_mc,
            "repaired": False,
        }
        if diverged and repair:
            self.refresh(tenant_id, plan_id=cached.plan_id if cached else "",
                         period_start=cached.period_start if cached else "",
                         period_end=cached.period_end if cached else "")
            report["repaired"] = True
        return report


_REPO: Optional[WalletRepository] = None


def get_wallet_repository() -> WalletRepository:
    global _REPO
    if _REPO is None:
        _REPO = WalletRepository()
    return _REPO


def reset_wallet_repository() -> None:
    global _REPO
    _REPO = None


def balances(tenant_id: str) -> Tuple[int, int]:
    """(available_mc, reserved_mc) from the ledger — the number to trust for spend
    decisions."""
    w = project(tenant_id)
    return w.available_mc, w.reserved_mc
