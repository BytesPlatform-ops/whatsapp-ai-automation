"""Credit reservations — a hold placed on credits BEFORE a paid provider call.

A reservation moves ``max_reserved_mc`` from available → reserved (via a ledger
RESERVATION entry) so the credits can't be spent twice while the operation is in
flight. It later terminates as SETTLED (finalized to actual cost, unused released),
RELEASED (fully returned — nothing billable happened) or EXPIRED (abandoned; the
reconciliation worker releases it). Orchestration lives in ``service`` — this module
is the durable record + its state machine.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import List, Optional, Tuple

import persistence
from pydantic import BaseModel, ConfigDict, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def in_seconds(seconds: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat(timespec="seconds")


def _id() -> str:
    return "resv_" + secrets.token_hex(8)


class ReservationStatus(str, Enum):
    PENDING = "pending"      # created, ledger hold not yet placed (transient)
    ACTIVE = "active"        # hold placed; operation in flight
    SETTLED = "settled"      # finalized to actual cost
    RELEASED = "released"    # fully returned (unbilled failure / cancel)
    EXPIRED = "expired"      # abandoned; released by the reconciliation worker
    REFUNDED = "refunded"    # a compensating refund was issued after settlement


# Terminal — the worker never re-touches these.
TERMINAL = {ReservationStatus.SETTLED, ReservationStatus.RELEASED,
            ReservationStatus.EXPIRED, ReservationStatus.REFUNDED}


class Reservation(BaseModel):
    model_config = ConfigDict(extra="ignore", use_enum_values=True)
    tenant_id: str = Field(..., min_length=1)
    operation_type: str = ""           # e.g. content_text | influencer_idea | influencer_video
    source_product: str = ""           # content_agent | ai_influencer | publishing
    source_object_id: str = ""
    max_reserved_mc: int = 0
    estimated_provider_micro_usd: int = 0
    pricing_version: str = ""
    idempotency_key: str = ""          # unique per tenant — one user action = one reservation
    status: ReservationStatus = ReservationStatus.ACTIVE
    expires_at: str = ""
    settled_mc: int = 0
    provider_operation_id: str = ""    # links to the durable provider job (video etc.)
    reason_code: str = ""
    anomaly: str = ""                  # e.g. under_reserved (actual > reserved)
    created_by: str = ""
    created_at: str = ""
    updated_at: str = ""


class ReservationRepository:
    table_name = "credit_reservations"

    def __init__(self) -> None:
        self._repo = persistence.table(self.table_name)

    def _build(self, row: Optional[dict]) -> Optional[Reservation]:
        return Reservation(**row["data"]) if row else None

    def create(self, r: Reservation) -> Tuple[str, Reservation]:
        rid = _id()
        r = r.model_copy(update={"created_at": now_iso(), "updated_at": now_iso()})
        self._repo.upsert(persistence.envelope(rid, r.tenant_id, r.model_dump(mode="json")))
        return rid, r

    def get(self, tenant_id: str, rid: str) -> Optional[Tuple[str, Reservation]]:
        m = self._build(self._repo.get(tenant_id, rid))
        return (rid, m) if m else None

    def update(self, tenant_id: str, rid: str, **fields) -> Optional[Tuple[str, Reservation]]:
        found = self.get(tenant_id, rid)
        if found is None:
            return None
        _, r = found
        fields["updated_at"] = now_iso()
        updated = r.model_copy(update=fields)
        self._repo.upsert(persistence.envelope(rid, tenant_id, updated.model_dump(mode="json")))
        return rid, updated

    def find_by_idempotency(self, tenant_id: str, key: str) -> Optional[Tuple[str, Reservation]]:
        if not key:
            return None
        for row in self._repo.list_by_tenant(tenant_id):
            m = self._build(row)
            if m and m.idempotency_key == key:
                return row["id"], m
        return None

    def find_by_provider_op(self, tenant_id: str, provider_operation_id: str) -> Optional[Tuple[str, Reservation]]:
        if not provider_operation_id:
            return None
        for row in self._repo.list_by_tenant(tenant_id):
            m = self._build(row)
            if m and m.provider_operation_id == provider_operation_id:
                return row["id"], m
        return None

    def list(self, tenant_id: str) -> List[Tuple[str, Reservation]]:
        return [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]

    # ── worker-facing (cross-tenant) ────────────────────────────────────────────
    def _all_rows(self) -> List[dict]:
        rows = getattr(self._repo, "_rows", None)
        if rows is not None:
            return list(rows)
        try:
            import httpx
            with httpx.Client(timeout=20) as http:
                r = http.get(persistence._sb_rest(self.table_name), headers=persistence._sb_headers(),
                             params={"order": "created_at.asc"})
                return r.json() if r.status_code == 200 else []
        except Exception:
            return []

    def active_expired(self, *, now: str = "") -> List[Tuple[str, Reservation]]:
        """ACTIVE reservations whose TTL has passed — candidates for reconciliation."""
        now = now or now_iso()
        out: List[Tuple[str, Reservation]] = []
        for row in self._all_rows():
            m = self._build(row)
            if m and m.status == ReservationStatus.ACTIVE.value and m.expires_at and m.expires_at <= now:
                out.append((row["id"], m))
        return out


_REPO: Optional[ReservationRepository] = None


def get_reservation_repository() -> ReservationRepository:
    global _REPO
    if _REPO is None:
        _REPO = ReservationRepository()
    return _REPO


def reset_reservation_repository() -> None:
    global _REPO
    _REPO = None
