"""CRM bidirectional sync engine (Parts 15-22/28).

Ingests normalised external records into canonical Pixie entities (contacts/leads/
deals) through the mapping layer; runs bounded, resumable initial import and
cursor-based incremental sync; detects/resolves conflicts; and performs
approval-gated outbound writes (OFF by default). Compliance is Pixie-authoritative:
imported contacts NEVER auto-gain campaign consent, and an external CRM can NEVER
remove Pixie suppression.
"""

from __future__ import annotations

from typing import Optional

from . import stores
from .ids import new_id, now_iso

# hard compliance fields that external CRM writes can never override
_HARD_COMPLIANCE = {"suppressed", "opted_out", "dnc", "consent"}

CONFLICT_STATES = ("open", "auto_resolved", "pixie_selected", "external_selected",
                   "merged", "ignored", "blocked", "stale", "resolved")


def _audit(tenant_id, provider, action, detail=None):
    stores.crm_audit().put(tenant_id, {"id": new_id("crmaud"), "tenant_id": tenant_id, "provider": provider,
                                       "action": action, "detail": detail or {}, "created_at": now_iso()})


def _result(tenant_id, provider, object_type, record_id, outcome, detail=None):
    stores.crm_sync_results().put(tenant_id, {
        "id": new_id("crmres"), "tenant_id": tenant_id, "provider": provider, "object_type": object_type,
        "record_id": record_id, "outcome": outcome, "detail": detail or {}, "created_at": now_iso()})


# ── ingest one normalised record → canonical ──────────────────────────────────

def ingest_record(tenant_id: str, provider: str, record: dict) -> dict:
    """Dedup → conflict check → upsert canonical → mapping. Idempotent on
    (provider, object_type, record_id)."""
    from . import crm_mapping
    object_type = record.get("object_type", "contact")
    record_id = record.get("record_id", "")
    if not record_id:
        return {"status": "skipped", "reason": "no_record_id"}

    if object_type in ("contact", "lead"):
        return _ingest_contact(tenant_id, provider, record, object_type)
    if object_type == "deal":
        return _ingest_deal(tenant_id, provider, record)
    # companies/tasks/notes/etc: store mapping only (bounded canonical projection)
    crm_mapping.link_mapping(tenant_id, provider, object_type, record_id,
                             canonical_type=object_type, canonical_id=record_id, version=record.get("version", ""))
    _result(tenant_id, provider, object_type, record_id, "mapped")
    return {"status": "mapped", "object_type": object_type}


def _ingest_contact(tenant_id, provider, record, object_type) -> dict:
    from . import crm_mapping
    match = crm_mapping.match_contact(tenant_id, provider, record)
    if match["status"] == "multiple_candidates":
        _open_conflict(tenant_id, provider, "contact", record["record_id"],
                       kind="multiple_candidates", detail={"candidates": match["candidates"]})
        _result(tenant_id, provider, object_type, record["record_id"], "conflict")
        return {"status": "conflict", "reason": "multiple_candidates"}
    if match["status"] == "invalid_identity":
        _result(tenant_id, provider, object_type, record["record_id"], "invalid_identity")
        return {"status": "invalid_identity"}

    proj = crm_mapping.apply_field_mappings(tenant_id, provider, "contact", record)
    if proj["missing_required"]:
        _open_conflict(tenant_id, provider, "contact", record["record_id"],
                       kind="missing_required", detail={"fields": proj["missing_required"]})
        return {"status": "review", "reason": "missing_required"}
    f = proj["fields"]

    if match["status"] in ("exact_existing_mapping", "exact_email", "exact_phone"):
        canonical_id = match["canonical_id"]
        # field-level conflict detection before update
        conflicts = _detect_field_conflicts(tenant_id, canonical_id, f)
        if conflicts:
            _open_conflict(tenant_id, provider, "contact", record["record_id"],
                           kind="field_conflict", detail={"fields": conflicts, "canonical_id": canonical_id})
    else:
        # new contact — source=crm, NO campaign consent, NO invented suppression
        c = stores.find_or_create_contact(
            tenant_id, name=f.get("name") or (f.get("first_name", "") + " " + f.get("last_name", "")).strip(),
            email=f.get("email") or None, phone=f.get("phone") or None,
            company=f.get("company") or None, source="crm")
        canonical_id = c.get("id", "")

    # explicit consent/suppression mapping only (never auto-consent; never remove suppression)
    _apply_consent_mapping(tenant_id, provider, canonical_id, record)

    crm_mapping.link_mapping(tenant_id, provider, "contact", record["record_id"],
                             canonical_type="contact", canonical_id=canonical_id, version=record.get("version", ""))
    _result(tenant_id, provider, object_type, record["record_id"], "imported", {"match": match["status"]})
    return {"status": "imported", "canonical_id": canonical_id, "match": match["status"]}


def _ingest_deal(tenant_id, provider, record) -> dict:
    from . import crm_mapping
    canonical_stage = crm_mapping.map_stage(tenant_id, provider, record.get("pipeline_id", ""), record.get("stage_id", ""))
    rec = {"id": f"crmdeal::{tenant_id}::{provider}::{record['record_id']}", "tenant_id": tenant_id,
           "provider": provider, "external_id": record["record_id"],
           "value": (record.get("fields") or {}).get("value"), "currency": (record.get("fields") or {}).get("currency"),
           "status": (record.get("fields") or {}).get("status"), "external_stage": record.get("stage_id", ""),
           "canonical_stage": canonical_stage, "stage_unmapped": canonical_stage is None,
           "updated_at": now_iso()}
    stores.crm_objects().put(tenant_id, rec)
    crm_mapping.link_mapping(tenant_id, provider, "deal", record["record_id"],
                             canonical_type="deal", canonical_id=rec["id"], version=record.get("version", ""))
    if canonical_stage is None:
        _open_conflict(tenant_id, provider, "deal", record["record_id"], kind="unmapped_stage",
                       detail={"external_stage": record.get("stage_id", "")})
    _result(tenant_id, provider, "deal", record["record_id"], "imported")
    return {"status": "imported", "stage_mapped": canonical_stage is not None}


def _detect_field_conflicts(tenant_id, canonical_id, incoming: dict) -> list:
    c = stores.contacts().get(tenant_id, canonical_id) or {}
    conflicts = []
    for k in ("email", "phone", "company"):
        cur = (c.get(k) or "")
        inc = (incoming.get(k) or "")
        if cur and inc and str(cur).strip().lower() != str(inc).strip().lower():
            conflicts.append(k)
    return conflicts


def _apply_consent_mapping(tenant_id, provider, canonical_id, record):
    """Only an explicitly configured consent mapping may add a Pixie consent record;
    a mapped opt-out may ADD suppression. Suppression is never removed from CRM."""
    from . import config_repo
    cfg = (config_repo.get_active(tenant_id) or {}).get("crm_consent_mapping") or {}
    field = cfg.get(f"{provider}_consent_field")
    if field:
        val = (record.get("custom_fields") or {}).get(field)
        if val in (True, "true", "yes", "1", "granted"):
            stores.consent().put(tenant_id, {"id": new_id("consent"), "tenant_id": tenant_id,
                                            "contact_id": canonical_id, "purpose": "promotional",
                                            "granted": True, "source": f"crm:{provider}", "created_at": now_iso()})
    optout_field = cfg.get(f"{provider}_optout_field")
    if optout_field:
        val = (record.get("custom_fields") or {}).get(optout_field)
        if val in (True, "true", "yes", "1"):
            from .schemas import OptOut
            stores.suppression().put(tenant_id, OptOut(tenant_id=tenant_id, contact_id=canonical_id,
                                                       channel=None, reason="crm_optout", source=f"crm:{provider}",
                                                       scope="all").model_dump())


# ── bounded initial import (resumable) ────────────────────────────────────────

def initial_import(tenant_id: str, provider: str, object_type: str, *, max_pages: int = 50) -> dict:
    """Durable, resumable, checkpoint-based import. Does NOT auto-enrol into campaigns."""
    from ..providers.crm import get_adapter, CRMError, base as crm_base
    ck_id = f"crmck::{tenant_id}::{provider}::{object_type}::import"
    ck = stores.crm_checkpoints().get(tenant_id, ck_id) or {"id": ck_id, "tenant_id": tenant_id,
                                                            "provider": provider, "object_type": object_type,
                                                            "cursor": "", "imported": 0, "status": "running"}
    if ck.get("status") == "completed":
        return {"status": "already_completed", "imported": ck.get("imported", 0)}
    adapter = get_adapter(provider)
    pages = 0
    try:
        while pages < max_pages:
            res = adapter.list_records(tenant_id, object_type, cursor=ck.get("cursor", ""))
            for r in res["records"]:
                ingest_record(tenant_id, provider, r)
                ck["imported"] = int(ck.get("imported", 0)) + 1
            ck["cursor"] = res["next_cursor"]
            stores.crm_checkpoints().put(tenant_id, ck)  # durable after each page
            pages += 1
            if not res["has_more"]:
                ck["status"] = "completed"
                break
    except CRMError as exc:
        ck["status"] = "error"; ck["last_error"] = exc.category
        stores.crm_checkpoints().put(tenant_id, ck)
        return {"status": "error", "reason": exc.category, "imported": ck.get("imported", 0)}
    stores.crm_checkpoints().put(tenant_id, ck)
    _audit(tenant_id, provider, "initial_import", {"object_type": object_type, "imported": ck["imported"]})
    return {"status": ck.get("status", "running"), "imported": ck.get("imported", 0)}


# ── cursor-based incremental sync ─────────────────────────────────────────────

def incremental_sync(tenant_id: str, provider: str) -> dict:
    from ..providers.crm import get_adapter, CRMError
    ck_id = f"crmck::{tenant_id}::{provider}::incremental"
    ck = stores.crm_checkpoints().get(tenant_id, ck_id) or {"id": ck_id, "tenant_id": tenant_id,
                                                            "provider": provider, "cursor": ""}
    adapter = get_adapter(provider)
    try:
        res = adapter.fetch_incremental_changes(tenant_id, ck.get("cursor", ""))
    except CRMError as exc:
        return {"status": "error", "reason": exc.category}
    n = 0
    for r in res["records"]:
        ingest_record(tenant_id, provider, r)
        n += 1
    ck["cursor"] = res["next_cursor"]  # advance only after durable processing
    ck["last_success_at"] = now_iso()
    stores.crm_checkpoints().put(tenant_id, ck)
    return {"status": "ok", "processed": n, "cursor": ck["cursor"]}


def recover_cursor(tenant_id: str, provider: str) -> dict:
    """Bounded recovery — never an unbounded full scan."""
    ck_id = f"crmck::{tenant_id}::{provider}::incremental"
    ck = stores.crm_checkpoints().get(tenant_id, ck_id) or {"id": ck_id, "tenant_id": tenant_id, "provider": provider}
    ck["cursor"] = "stale"
    stores.crm_checkpoints().put(tenant_id, ck)
    return incremental_sync(tenant_id, provider)


# ── conflicts ─────────────────────────────────────────────────────────────────

def _open_conflict(tenant_id, provider, object_type, record_id, *, kind, detail=None):
    cid = f"crmcf::{tenant_id}::{provider}::{object_type}::{record_id}::{kind}"
    if stores.crm_conflicts().get(tenant_id, cid) is not None:
        return
    stores.crm_conflicts().put(tenant_id, {
        "id": cid, "tenant_id": tenant_id, "provider": provider, "object_type": object_type,
        "record_id": record_id, "kind": kind, "state": "open", "detail": detail or {}, "created_at": now_iso()})


def list_conflicts(tenant_id: str, *, state: str = "open") -> list[dict]:
    return [c for c in stores.crm_conflicts().list(tenant_id) if not state or c.get("state") == state]


def resolve_conflict(tenant_id: str, conflict_id: str, *, resolution: str, actor: str = "operator") -> dict:
    c = stores.crm_conflicts().get(tenant_id, conflict_id)
    if c is None:
        return {"status": "not_found"}
    if resolution not in ("pixie_selected", "external_selected", "merged", "ignored", "detached"):
        return {"status": "invalid_resolution"}
    # hard compliance fields can never select the external value
    if resolution == "external_selected" and any(f in _HARD_COMPLIANCE for f in (c.get("detail", {}).get("fields") or [])):
        return {"status": "blocked", "reason": "compliance_field_protected"}
    c["state"] = resolution if resolution != "detached" else "resolved"
    c["resolved_by"] = actor; c["resolved_at"] = now_iso()
    stores.crm_conflicts().put(tenant_id, c)
    _audit(tenant_id, c.get("provider", ""), "conflict_resolved", {"resolution": resolution})
    return {"status": "resolved", "resolution": resolution}


# ── outbound write (disabled by default, idempotent) ──────────────────────────

def outbound_write(tenant_id: str, provider: str, *, canonical_type: str, canonical_id: str,
                   trigger: str, payload: Optional[dict] = None) -> dict:
    from . import crm_marketplace, crm_mapping
    from ..providers.crm import get_adapter, CRMError
    if not crm_marketplace.external_write_enabled():
        return {"status": "write_disabled"}
    idem = f"crmwrite::{tenant_id}::{provider}::{canonical_type}::{canonical_id}::{trigger}"
    prev = stores.crm_outbound().get(tenant_id, idem)
    if prev is not None and prev.get("state") in ("written", "provider_confirmed"):
        return {"status": "duplicate", "external_id": prev.get("external_id", "")}
    existing = crm_mapping.mapping_for_canonical(tenant_id, provider, canonical_id)
    adapter = get_adapter(provider)
    try:
        if existing:
            res = adapter.update_record(tenant_id, canonical_type, existing["record_id"], payload or {})
        else:
            res = adapter.create_record(tenant_id, canonical_type, payload or {})
    except CRMError as exc:
        stores.crm_outbound().put(tenant_id, {"id": idem, "tenant_id": tenant_id, "provider": provider,
                                             "state": ("blocked" if exc.category == "permission_missing" else "failed"),
                                             "reason": exc.category, "created_at": now_iso()})
        return {"status": ("blocked" if exc.category == "permission_missing" else "failed"), "reason": exc.category}
    stores.crm_outbound().put(tenant_id, {"id": idem, "tenant_id": tenant_id, "provider": provider,
                                         "state": "provider_confirmed", "external_id": res.get("record_id", ""),
                                         "trigger": trigger, "created_at": now_iso()})
    if not existing:
        crm_mapping.link_mapping(tenant_id, provider, canonical_type, res.get("record_id", ""),
                                 canonical_type=canonical_type, canonical_id=canonical_id,
                                 version=res.get("version", ""), direction="export")
    return {"status": "written", "external_id": res.get("record_id", "")}
