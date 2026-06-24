"""Per-tenant JSON stores for campaigns (gitignored under data/).

Mirrors the actions/crm.py read-rewrite pattern. Swappable for Postgres later
without changing the function surface. Everything is tenant-scoped.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .schemas import (
    Campaign,
    CampaignTarget,
    ConsentRecord,
    DoNotContactEntry,
    OptOutEntry,
)

_DIR = Path(__file__).resolve().parent.parent / "data" / "campaigns"


def _path(kind: str, tenant_id: str) -> Path:
    return _DIR / f"{kind}_{tenant_id}.json"


def _read(kind: str, tenant_id: str) -> list[dict]:
    p = _path(kind, tenant_id)
    return json.loads(p.read_text()) if p.exists() else []


def _write(kind: str, tenant_id: str, rows: list[dict]) -> None:
    _DIR.mkdir(parents=True, exist_ok=True)
    _path(kind, tenant_id).write_text(json.dumps(rows, indent=2, ensure_ascii=False, default=str))


# ── campaigns ──────────────────────────────────────────────────────────────
def save_campaign(c: Campaign) -> Campaign:
    rows = [r for r in _read("campaign", c.tenant_id) if r.get("id") != c.id]
    rows.append(json.loads(c.model_dump_json()))
    _write("campaign", c.tenant_id, rows)
    return c


def get_campaign(tenant_id: str, campaign_id: str) -> Campaign | None:
    for r in _read("campaign", tenant_id):
        if r.get("id") == campaign_id:
            return Campaign.model_validate(r)
    return None


def list_campaigns(tenant_id: str) -> list[Campaign]:
    return [Campaign.model_validate(r) for r in _read("campaign", tenant_id)]


# ── targets ────────────────────────────────────────────────────────────────
def add_targets(targets: list[CampaignTarget]) -> None:
    if not targets:
        return
    tenant_id = targets[0].tenant_id
    rows = _read("target", tenant_id)
    rows.extend(json.loads(t.model_dump_json()) for t in targets)
    _write("target", tenant_id, rows)


def list_targets(tenant_id: str, campaign_id: str) -> list[CampaignTarget]:
    return [CampaignTarget.model_validate(r) for r in _read("target", tenant_id) if r.get("campaign_id") == campaign_id]


def update_target(t: CampaignTarget) -> None:
    rows = [r for r in _read("target", t.tenant_id) if r.get("id") != t.id]
    rows.append(json.loads(t.model_dump_json()))
    _write("target", t.tenant_id, rows)


# ── consent / opt-out / DNC ────────────────────────────────────────────────
def add_consent(c: ConsentRecord) -> ConsentRecord:
    rows = _read("consent", c.tenant_id)
    rows.append(json.loads(c.model_dump_json()))
    _write("consent", c.tenant_id, rows)
    return c


def list_consent(tenant_id: str) -> list[ConsentRecord]:
    return [ConsentRecord.model_validate(r) for r in _read("consent", tenant_id)]


def add_opt_out(o: OptOutEntry) -> OptOutEntry:
    rows = _read("optout", o.tenant_id)
    rows.append(json.loads(o.model_dump_json()))
    _write("optout", o.tenant_id, rows)
    return o


def list_opt_outs(tenant_id: str) -> list[OptOutEntry]:
    return [OptOutEntry.model_validate(r) for r in _read("optout", tenant_id)]


def add_dnc(d: DoNotContactEntry) -> DoNotContactEntry:
    rows = _read("dnc", d.tenant_id)
    rows.append(json.loads(d.model_dump_json()))
    _write("dnc", d.tenant_id, rows)
    return d


def list_dnc(tenant_id: str) -> list[DoNotContactEntry]:
    return [DoNotContactEntry.model_validate(r) for r in _read("dnc", tenant_id)]


# ── send log (idempotency + frequency cap) ─────────────────────────────────
def log_send(tenant_id: str, *, campaign_id: str, idempotency_key: str, contact: str, status: str) -> None:
    rows = _read("sendlog", tenant_id)
    rows.append({
        "campaign_id": campaign_id, "idempotency_key": idempotency_key,
        "contact": contact, "status": status,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    _write("sendlog", tenant_id, rows)


def key_already_logged(tenant_id: str, idempotency_key: str) -> bool:
    return any(r.get("idempotency_key") == idempotency_key for r in _read("sendlog", tenant_id))


def recent_send_count(tenant_id: str, contact: str, window_days: int) -> int:
    if not contact:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    n = 0
    for r in _read("sendlog", tenant_id):
        if r.get("contact") != contact:
            continue
        try:
            if datetime.fromisoformat(r["at"]) >= cutoff:
                n += 1
        except Exception:
            continue
    return n
