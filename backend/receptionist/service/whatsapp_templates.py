"""WhatsApp message-template synchronisation + validation (Wave 12, Parts 14/15).

Durable local mirror of provider-approved templates. Only APPROVED/usable templates
may be sent; required variables are validated; rejected/disabled templates are
blocked. Provider-approved content is never modified locally. No bulk campaigns —
templates are for individual conversation follow-up / booking / reminder use.
"""

from __future__ import annotations

from typing import Optional

from . import stores
from .ids import now_iso


def _tid(tenant_id: str, name: str, language: str) -> str:
    return f"watpl::{tenant_id}::{name}::{language}"


def sync(tenant_id: str) -> dict:
    """Fetch templates from the provider adapter and mirror them durably."""
    from ..providers import whatsapp_cloud as wa
    try:
        templates = wa.list_templates(tenant_id)
    except wa.WhatsAppError as exc:
        return {"status": "failed", "reason": exc.category, "synced": 0}
    n = 0
    for t in templates:
        rec = {
            "id": _tid(tenant_id, t["name"], t["language"]), "tenant_id": tenant_id,
            "name": t["name"], "language": t["language"], "category": t["category"],
            "status": t["status"], "provider_id": t.get("provider_id", ""),
            "variables": t.get("variables", 0), "components": t.get("components", []),
            "last_synced_at": now_iso(),
        }
        stores.wa_templates().put(tenant_id, rec)
        n += 1
    return {"status": "completed", "synced": n, "synced_at": now_iso()}


def list_templates(tenant_id: str) -> list[dict]:
    return stores.wa_templates().list(tenant_id)


def get_template(tenant_id: str, name: str, language: str = "") -> Optional[dict]:
    for t in stores.wa_templates().list(tenant_id):
        if t.get("name") == name and (not language or t.get("language") == language):
            return t
    return None


def validate_for_send(tenant_id: str, name: str, variables: list) -> tuple[bool, str]:
    """Return (ok, reason). Blocks unknown/rejected templates and variable mismatch."""
    tpl = get_template(tenant_id, name)
    if tpl is None:
        return False, "not_found"
    if (tpl.get("status") or "").upper() != "APPROVED":
        return False, "not_approved"
    required = int(tpl.get("variables", 0))
    if len(variables or []) != required:
        return False, "variable_mismatch"
    return True, ""
