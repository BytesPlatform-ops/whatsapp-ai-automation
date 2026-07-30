"""Canonical, durable, versioned Receptionist configuration repository (Wave 5).

One tenant-scoped source of truth for business configuration used by onboarding,
the settings UI, the preview/test console, the canonical engine, the knowledge
system and the human-handoff policy. Replaces the old JSON-file onboarding store
and the flat (unversioned) ``receptionist_business_profile`` row.

Durability + versioning:
  * ``receptionist_configurations`` — one active row per tenant (id == tenant_id),
    holding the current field values + ``active_version_id`` + ``config_version``.
  * ``receptionist_config_versions`` — an immutable snapshot per save. Old versions
    are archived (``status='archived'``); exactly one is ``status='active'``.

Everything is durable via ``service.stores`` (memory | file | supabase), so config
survives restart and is multi-instance safe in supabase mode. Missing required
configuration is detectable via :func:`missing_required` so the engine can degrade
honestly instead of inventing business facts.
"""

from __future__ import annotations

from typing import Optional

from . import stores
from .ids import new_id, now_iso

# ── canonical configuration fields ────────────────────────────────────────────
# The superset the product exposes. Values are plain strings/lists; the engine
# reads a BusinessProfile-shaped projection via :func:`to_business_profile`.
CONFIG_FIELDS: list[str] = [
    "business_name", "assistant_name", "tone", "languages",
    "services", "service_descriptions", "prices",
    "hours", "timezone", "locations", "service_areas",
    "booking_rules", "cancellation_policy", "refund_policy", "payment_policy",
    "escalation_contacts", "escalation_triggers", "handoff_rules",
    "restricted_subjects", "contact_details", "faqs",
    "phone", "email", "website", "address", "industry",
    "policies", "process", "custom_instructions",
    "gmail_reply_mode",  # Gmail channel policy (Wave 8)
    "whatsapp_reply_mode",  # WhatsApp channel policy (Wave 12)
    "instagram_reply_mode",  # Instagram channel policy (Wave 13)
    "messenger_reply_mode",  # Messenger channel policy (Wave 13)
]

# Configuration is "configured enough to answer" once these are present.
REQUIRED_FIELDS: list[str] = ["business_name", "hours"]

_PROMPT_VERSION = "rp-1"
_POLICY_VERSION = "pol-1"


# ── defaults ──────────────────────────────────────────────────────────────────

def _default_config(tenant_id: str) -> dict:
    cfg = {k: ("" if k not in ("services", "service_areas", "locations", "faqs") else []) for k in CONFIG_FIELDS}
    cfg.update({
        "tenant_id": tenant_id,
        "id": tenant_id,
        "assistant_name": "Receptionist",
        "tone": "friendly, professional",
        "languages": "English",
        "timezone": "UTC",
        "prompt_version": _PROMPT_VERSION,
        "policy_version": _POLICY_VERSION,
        "config_version": 0,
        "active_version_id": "",
        "updated_by": "",
        "updated_at": now_iso(),
    })
    return cfg


# ── read ──────────────────────────────────────────────────────────────────────

def get_active(tenant_id: str) -> Optional[dict]:
    """Return the tenant's active configuration, or None if none has been saved."""
    return stores.configurations().get(tenant_id, tenant_id)


def get_active_or_default(tenant_id: str) -> dict:
    """Active config, or an unsaved default (never None). Safe for grounding."""
    existing = get_active(tenant_id)
    return existing if existing is not None else _default_config(tenant_id)


def is_configured(tenant_id: str) -> bool:
    return not missing_required(tenant_id)


def missing_required(tenant_id: str) -> list[str]:
    cfg = get_active(tenant_id)
    if cfg is None:
        return list(REQUIRED_FIELDS)
    return [f for f in REQUIRED_FIELDS if not cfg.get(f)]


# ── versions ──────────────────────────────────────────────────────────────────

def list_versions(tenant_id: str) -> list[dict]:
    """Newest-first version snapshots for a tenant."""
    rows = stores.config_versions().query(tenant_id, tenant_id_ref=tenant_id)
    return sorted(rows, key=lambda v: int(v.get("version", 0)), reverse=True)


def get_version(tenant_id: str, version_id: str) -> Optional[dict]:
    return stores.config_versions().get(tenant_id, version_id)


# ── write ─────────────────────────────────────────────────────────────────────

def save(tenant_id: str, patch: dict, *, updated_by: str = "") -> dict:
    """Merge ``patch`` onto the active config, snapshot a new immutable version,
    archive the previous active version, and return the new active config.

    Only known ``CONFIG_FIELDS`` (plus tenant/id) are accepted; non-empty values
    win over existing ones (empty string / None never clobbers a saved value).
    """
    current = get_active(tenant_id)
    base = dict(current) if current is not None else _default_config(tenant_id)

    for key, val in (patch or {}).items():
        if key in ("tenant_id", "id", "config_version", "active_version_id",
                   "updated_at", "updated_by"):
            continue
        if key not in CONFIG_FIELDS and key not in ("prompt_version", "policy_version"):
            continue
        if val is None:
            continue
        if isinstance(val, str) and val == "" and base.get(key):
            continue  # don't clobber a saved value with an empty string
        base[key] = val

    now = now_iso()
    new_version = int(base.get("config_version", 0)) + 1
    version_id = new_id("cfgv")

    # Archive the previous active version.
    prev_active_id = base.get("active_version_id", "")
    if prev_active_id:
        prev = stores.config_versions().get(tenant_id, prev_active_id)
        if prev is not None:
            prev["status"] = "archived"
            prev["archived_at"] = now
            stores.config_versions().put(tenant_id, prev)

    # Snapshot the new version (immutable).
    snapshot = {k: base.get(k) for k in CONFIG_FIELDS}
    version_row = {
        "id": version_id,
        "tenant_id": tenant_id,
        "tenant_id_ref": tenant_id,
        "version": new_version,
        "status": "active",
        "prompt_version": base.get("prompt_version", _PROMPT_VERSION),
        "policy_version": base.get("policy_version", _POLICY_VERSION),
        "snapshot": snapshot,
        "updated_by": updated_by,
        "created_at": now,
    }
    stores.config_versions().put(tenant_id, version_row)

    base.update({
        "tenant_id": tenant_id,
        "id": tenant_id,
        "config_version": new_version,
        "active_version_id": version_id,
        "prompt_version": base.get("prompt_version", _PROMPT_VERSION),
        "policy_version": base.get("policy_version", _POLICY_VERSION),
        "updated_by": updated_by,
        "updated_at": now,
    })
    return stores.configurations().put(tenant_id, base)


def activate_version(tenant_id: str, version_id: str) -> Optional[dict]:
    """Roll the active config back to a prior version's snapshot. Archives the
    version that was active; marks the chosen one active. Returns new active config."""
    target = stores.config_versions().get(tenant_id, version_id)
    if target is None:
        return None
    current = get_active_or_default(tenant_id)
    now = now_iso()

    prev_active_id = current.get("active_version_id", "")
    if prev_active_id and prev_active_id != version_id:
        prev = stores.config_versions().get(tenant_id, prev_active_id)
        if prev is not None:
            prev["status"] = "archived"
            prev["archived_at"] = now
            stores.config_versions().put(tenant_id, prev)

    target["status"] = "active"
    target.pop("archived_at", None)
    stores.config_versions().put(tenant_id, target)

    snapshot = dict(target.get("snapshot") or {})
    new_active = dict(current)
    new_active.update(snapshot)
    new_active.update({
        "tenant_id": tenant_id, "id": tenant_id,
        "config_version": int(current.get("config_version", 0)) + 1,
        "active_version_id": version_id,
        "prompt_version": target.get("prompt_version", _PROMPT_VERSION),
        "policy_version": target.get("policy_version", _POLICY_VERSION),
        "updated_by": current.get("updated_by", ""),
        "updated_at": now,
    })
    return stores.configurations().put(tenant_id, new_active)


def archive_version(tenant_id: str, version_id: str) -> bool:
    """Archive a non-active version. The active version cannot be archived."""
    v = stores.config_versions().get(tenant_id, version_id)
    if v is None or v.get("status") == "active":
        return False
    v["status"] = "archived"
    v["archived_at"] = now_iso()
    stores.config_versions().put(tenant_id, v)
    return True


# ── projection into the engine's BusinessProfile shape ─────────────────────────

def _as_list(v) -> list:
    if isinstance(v, list):
        return v
    if isinstance(v, str) and v.strip():
        return [s.strip() for s in v.split(",") if s.strip()]
    return []


def to_business_profile(cfg: dict) -> dict:
    """Project a config dict into the BusinessProfile fields the engine/handlers
    read. This is what makes onboarding ground the next response: the engine calls
    ``business_profile.get_profile`` every relevant turn, and that derives from here."""
    policies_bits = [b for b in (cfg.get("policies"), cfg.get("cancellation_policy"),
                                 cfg.get("refund_policy"), cfg.get("payment_policy"),
                                 cfg.get("booking_rules")) if b]
    escalation_bits = [b for b in (cfg.get("escalation_triggers"),
                                   cfg.get("handoff_rules"),
                                   cfg.get("escalation_contacts")) if b]
    return {
        "tenant_id": cfg.get("tenant_id", ""),
        "id": cfg.get("tenant_id", ""),
        "business_name": cfg.get("business_name", ""),
        "industry": cfg.get("industry", ""),
        "hours": cfg.get("hours", ""),
        "services": _as_list(cfg.get("services")),
        "pricing_notes": cfg.get("prices", "") or cfg.get("service_descriptions", ""),
        "location": cfg.get("locations") if isinstance(cfg.get("locations"), str)
                    else ", ".join(_as_list(cfg.get("locations"))),
        "address": cfg.get("address", ""),
        "phone": cfg.get("phone", ""),
        "email": cfg.get("email", ""),
        "website": cfg.get("website", ""),
        "policies": "\n".join(policies_bits),
        "process": cfg.get("process", ""),
        "tone": cfg.get("tone", "friendly, professional"),
        "escalation_rules": "\n".join(escalation_bits),
        "custom_instructions": cfg.get("custom_instructions", ""),
        "faqs": cfg.get("faqs") or [],
        "config_version": cfg.get("config_version", 0),
        "prompt_version": cfg.get("prompt_version", _PROMPT_VERSION),
        "policy_version": cfg.get("policy_version", _POLICY_VERSION),
        "updated_at": cfg.get("updated_at", ""),
    }
