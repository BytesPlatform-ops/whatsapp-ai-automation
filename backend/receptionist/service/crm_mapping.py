"""CRM identity/field/pipeline mapping + deduplication (Parts 8-13).

Maps normalised external records into canonical Pixie entities through durable,
tenant-scoped mappings. Contact matching uses only trusted signals (existing
mapping / verified email / verified phone) — never name/company fuzzy auto-merge.
Field mappings are typed + allowlisted (no executable transforms, no secret fields).
Pipeline/stage equivalence is always explicit; unknown stages stay unmapped.
"""

from __future__ import annotations

from typing import Optional

from . import stores
from .ids import new_id, now_iso

MATCH = ("exact_existing_mapping", "exact_email", "exact_phone", "multiple_candidates",
         "possible_match", "new_contact", "blocked_cross_tenant", "invalid_identity")

_FIELD_TYPES = ("text", "number", "boolean", "date", "datetime", "single_select",
                "multi_select", "email", "phone", "url", "currency", "owner")
# canonical fields campaign personalisation / contacts may receive (allowlist)
_CANONICAL_FIELDS = ("name", "first_name", "last_name", "email", "phone", "company",
                     "service_interest", "location", "source", "status")


def _norm_phone(p: str) -> str:
    from ..providers.sms_adapter import normalise_e164
    return normalise_e164(p or "")


# ── external mapping ──────────────────────────────────────────────────────────

def _map_id(tenant_id: str, provider: str, object_type: str, record_id: str) -> str:
    return f"crmmap::{tenant_id}::{provider}::{object_type}::{record_id}"


def link_mapping(tenant_id: str, provider: str, object_type: str, record_id: str, *,
                 canonical_type: str, canonical_id: str, version: str = "",
                 direction: str = "import") -> dict:
    rec = {
        "id": _map_id(tenant_id, provider, object_type, record_id), "tenant_id": tenant_id,
        "provider": provider, "object_type": object_type, "record_id": record_id,
        "canonical_type": canonical_type, "canonical_id": canonical_id, "version": version,
        "direction": direction, "sync_status": "synced", "conflict_state": "none",
        "last_provider_update": now_iso(), "last_pixie_update": now_iso(), "updated_at": now_iso()}
    return stores.crm_mappings().put(tenant_id, rec)


def get_mapping(tenant_id: str, provider: str, object_type: str, record_id: str) -> Optional[dict]:
    return stores.crm_mappings().get(tenant_id, _map_id(tenant_id, provider, object_type, record_id))


def mapping_for_canonical(tenant_id: str, provider: str, canonical_id: str) -> Optional[dict]:
    for m in stores.crm_mappings().list(tenant_id):
        if m.get("provider") == provider and m.get("canonical_id") == canonical_id:
            return m
    return None


# ── contact matching / dedup ──────────────────────────────────────────────────

def match_contact(tenant_id: str, provider: str, record: dict) -> dict:
    """Return {status, canonical_id?, candidates?}. Only trusted signals auto-link."""
    existing = get_mapping(tenant_id, provider, "contact", record["record_id"])
    if existing is not None:
        return {"status": "exact_existing_mapping", "canonical_id": existing["canonical_id"]}
    fields = record.get("fields") or {}
    email = (fields.get("email") or "").strip().lower()
    phone = _norm_phone(fields.get("phone") or "")
    if not email and not phone:
        return {"status": "invalid_identity"}
    by_email, by_phone = [], []
    for c in stores.contacts().list(tenant_id):
        if email and (c.get("email") or "").strip().lower() == email:
            by_email.append(c["id"])
        if phone and _norm_phone(c.get("phone") or "") == phone:
            by_phone.append(c["id"])
    candidates = list(dict.fromkeys(by_email + by_phone))
    if len(candidates) > 1:
        return {"status": "multiple_candidates", "candidates": candidates}
    if by_email:
        return {"status": "exact_email", "canonical_id": by_email[0]}
    if by_phone:
        return {"status": "exact_phone", "canonical_id": by_phone[0]}
    return {"status": "new_contact"}


# ── field mappings (typed, allowlisted) ───────────────────────────────────────

def set_field_mapping(tenant_id: str, provider: str, object_type: str, *, provider_field_id: str,
                      provider_field_name: str, provider_field_type: str, canonical_field: str,
                      direction: str = "import", required: bool = False) -> dict:
    validation = "ok"
    if provider_field_type not in _FIELD_TYPES:
        validation = "unsupported_provider_type"
    elif canonical_field not in _CANONICAL_FIELDS and not canonical_field.startswith("custom:"):
        validation = "unknown_canonical_field"
    elif canonical_field in ("email", "phone") and provider_field_type not in ("email", "phone", "text"):
        validation = "type_incompatible"
    rec = {
        "id": f"crmfm::{tenant_id}::{provider}::{object_type}::{provider_field_id}", "tenant_id": tenant_id,
        "provider": provider, "object_type": object_type, "provider_field_id": provider_field_id,
        "provider_field_name": provider_field_name, "provider_field_type": provider_field_type,
        "canonical_field": canonical_field, "direction": direction, "required": bool(required),
        "validation": validation, "version": _next_fm_version(tenant_id, provider, object_type, provider_field_id),
        "created_at": now_iso()}
    return stores.crm_field_mappings().put(tenant_id, rec)


def _next_fm_version(tenant_id, provider, object_type, field_id) -> int:
    fm_id = f"crmfm::{tenant_id}::{provider}::{object_type}::{field_id}"
    prev = stores.crm_field_mappings().get(tenant_id, fm_id)
    return int((prev or {}).get("version", 0)) + 1


def list_field_mappings(tenant_id: str, provider: str, object_type: str = "") -> list[dict]:
    return [f for f in stores.crm_field_mappings().list(tenant_id)
            if f.get("provider") == provider and (not object_type or f.get("object_type") == object_type)]


def apply_field_mappings(tenant_id: str, provider: str, object_type: str, record: dict) -> dict:
    """Project a normalised record onto canonical fields using active mappings.
    Returns {fields, missing_required[]}. Internal secrets are never accessible."""
    fields = dict(record.get("fields") or {})
    custom = record.get("custom_fields") or {}
    out: dict = {}
    missing: list[str] = []
    for m in list_field_mappings(tenant_id, provider, object_type):
        if m.get("validation") != "ok" or m.get("direction") == "export":
            continue
        src = m["provider_field_name"]
        val = custom.get(src, fields.get(src, ""))
        if not val and m.get("required"):
            missing.append(m["canonical_field"])
            continue
        if val != "":
            out[m["canonical_field"]] = val
    # always carry trusted identity fields
    for k in ("first_name", "last_name", "email", "phone", "name", "company"):
        if k in fields and k not in out:
            out[k] = fields[k]
    return {"fields": out, "missing_required": missing}


# ── pipeline / stage mapping (explicit only) ──────────────────────────────────

def set_pipeline_mapping(tenant_id: str, provider: str, *, external_pipeline_id: str,
                         canonical_pipeline_id: str, stage_map: Optional[dict] = None,
                         direction: str = "import") -> dict:
    rec = {
        "id": f"crmpm::{tenant_id}::{provider}::{external_pipeline_id}", "tenant_id": tenant_id,
        "provider": provider, "external_pipeline_id": external_pipeline_id,
        "canonical_pipeline_id": canonical_pipeline_id, "stage_map": stage_map or {},
        "direction": direction, "version": 1, "created_at": now_iso()}
    return stores.crm_pipeline_mappings().put(tenant_id, rec)


def map_stage(tenant_id: str, provider: str, external_pipeline_id: str, external_stage_id: str) -> Optional[str]:
    pm = stores.crm_pipeline_mappings().get(tenant_id, f"crmpm::{tenant_id}::{provider}::{external_pipeline_id}")
    if pm is None:
        return None  # unmapped pipeline → review, never guessed
    return (pm.get("stage_map") or {}).get(external_stage_id)  # None → unmapped stage stays unmapped
