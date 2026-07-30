"""Durable, tenant-scoped campaign + compliance store.

Consent, opt-out, do-not-contact, campaigns, targets and the send log are all
persisted through the shared durable layer (``receptionist.service.stores`` →
memory | file | supabase), so records survive restart and are multi-instance safe
in supabase mode. The gate, follow-up jobs and future channel sends read from here;
model output can never override a suppression record.

The old JSON files under ``data/campaigns/`` are NOT read at runtime anymore — they
remain importable via :func:`read_json_rows` for the one-time migration tool.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from receptionist.service import stores as _dstores

from .schemas import (
    Campaign,
    CampaignTarget,
    ConsentRecord,
    DoNotContactEntry,
    OptOutEntry,
)

_DIR = Path(__file__).resolve().parent.parent / "data" / "campaigns"


# ── legacy JSON reader (import tool only; never used at runtime) ───────────────
def read_json_rows(kind: str, tenant_id: str) -> list[dict]:
    p = _DIR / f"{kind}_{tenant_id}.json"
    return json.loads(p.read_text()) if p.exists() else []


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _put(table: str, tenant_id: str, row: dict) -> None:
    _dstores.store(table).put(tenant_id, row)


def _list(table: str, tenant_id: str) -> list[dict]:
    return _dstores.store(table).list(tenant_id, newest_first=False)


# ── campaigns ──────────────────────────────────────────────────────────────
def save_campaign(c: Campaign) -> Campaign:
    row = json.loads(c.model_dump_json())
    row.setdefault("id", c.id)
    _put(_dstores.T_CAMPAIGNS, c.tenant_id, row)
    return c


def get_campaign(tenant_id: str, campaign_id: str) -> Campaign | None:
    row = _dstores.store(_dstores.T_CAMPAIGNS).get(tenant_id, campaign_id)
    return Campaign.model_validate(row) if row else None


def list_campaigns(tenant_id: str) -> list[Campaign]:
    return [Campaign.model_validate(r) for r in _list(_dstores.T_CAMPAIGNS, tenant_id)]


# ── targets ────────────────────────────────────────────────────────────────
def add_targets(targets: list[CampaignTarget]) -> None:
    for t in targets:
        row = json.loads(t.model_dump_json())
        row.setdefault("id", t.id)
        _put(_dstores.T_CAMPAIGN_TARGETS, t.tenant_id, row)


def list_targets(tenant_id: str, campaign_id: str) -> list[CampaignTarget]:
    return [CampaignTarget.model_validate(r) for r in _list(_dstores.T_CAMPAIGN_TARGETS, tenant_id)
            if r.get("campaign_id") == campaign_id]


def update_target(t: CampaignTarget) -> None:
    row = json.loads(t.model_dump_json())
    row.setdefault("id", t.id)
    _put(_dstores.T_CAMPAIGN_TARGETS, t.tenant_id, row)


# ── consent / opt-out / DNC ────────────────────────────────────────────────
def add_consent(c: ConsentRecord) -> ConsentRecord:
    row = json.loads(c.model_dump_json())
    row.setdefault("id", getattr(c, "id", None) or _new_id("consent"))
    _put(_dstores.T_CONSENT, c.tenant_id, row)
    return c


def list_consent(tenant_id: str) -> list[ConsentRecord]:
    return [ConsentRecord.model_validate(r) for r in _list(_dstores.T_CONSENT, tenant_id)]


def add_opt_out(o: OptOutEntry) -> OptOutEntry:
    row = json.loads(o.model_dump_json())
    row.setdefault("id", getattr(o, "id", None) or _new_id("optout"))
    _put(_dstores.T_OPTOUTS, o.tenant_id, row)
    return o


def list_opt_outs(tenant_id: str) -> list[OptOutEntry]:
    # T_OPTOUTS is shared with the action-registry OptOut schema; validate defensively
    # (extra fields are ignored; incompatible channel values are skipped, not fatal).
    out: list[OptOutEntry] = []
    for r in _list(_dstores.T_OPTOUTS, tenant_id):
        try:
            out.append(OptOutEntry.model_validate(r))
        except Exception:
            continue
    return out


def add_dnc(d: DoNotContactEntry) -> DoNotContactEntry:
    row = json.loads(d.model_dump_json())
    row.setdefault("id", getattr(d, "id", None) or _new_id("dnc"))
    _put(_dstores.T_DNC, d.tenant_id, row)
    return d


def list_dnc(tenant_id: str) -> list[DoNotContactEntry]:
    return [DoNotContactEntry.model_validate(r) for r in _list(_dstores.T_DNC, tenant_id)]


# ── send log (idempotency + frequency cap) ─────────────────────────────────
def log_send(tenant_id: str, *, campaign_id: str, idempotency_key: str, contact: str, status: str) -> None:
    _put(_dstores.T_SEND_LOG, tenant_id, {
        "id": _new_id("send"),
        "campaign_id": campaign_id, "idempotency_key": idempotency_key,
        "contact": contact, "status": status,
        "at": datetime.now(timezone.utc).isoformat(),
    })


def key_already_logged(tenant_id: str, idempotency_key: str) -> bool:
    return any(r.get("idempotency_key") == idempotency_key for r in _list(_dstores.T_SEND_LOG, tenant_id))


def recent_send_count(tenant_id: str, contact: str, window_days: int) -> int:
    if not contact:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    n = 0
    for r in _list(_dstores.T_SEND_LOG, tenant_id):
        if r.get("contact") != contact:
            continue
        try:
            if datetime.fromisoformat(r["at"]) >= cutoff:
                n += 1
        except Exception:
            continue
    return n
