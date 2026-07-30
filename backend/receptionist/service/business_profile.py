"""Business profile + knowledge base — the receptionist's source of truth.

The FAQ handler answers ONLY from what's configured here (profile fields, FAQs,
knowledge items). If nothing matches, `answer_question` returns None so the
handler says "I'll confirm with the team" instead of hallucinating a policy.

Retrieval is a lightweight keyword-overlap ranker (no embeddings dependency) —
deterministic and $0, consistent with the fake-mode-first philosophy.
"""

from __future__ import annotations

import re
from typing import Optional

from . import stores
from .ids import now_iso
from .schemas import BusinessProfile, KnowledgeItem

_WORD = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> set[str]:
    return set(_WORD.findall((text or "").lower()))


# ── profile ───────────────────────────────────────────────────────────────────

def get_profile(tenant_id: str) -> dict:
    """Return the tenant's profile for runtime grounding.

    The canonical writable store is the versioned config repository. This projects
    the active config into the BusinessProfile shape the engine/handlers read, so a
    saved onboarding/settings change grounds the very next turn. Falls back to the
    legacy flat ``receptionist_business_profile`` row (pre-config-repo tenants),
    then to an unsaved default.
    """
    from . import config_repo
    cfg = config_repo.get_active(tenant_id)
    if cfg is not None:
        return config_repo.to_business_profile(cfg)
    existing = stores.business_profiles().get(tenant_id, tenant_id)
    if existing is not None:
        return existing
    return BusinessProfile(tenant_id=tenant_id).model_dump()


# BusinessProfile field → canonical config field (only where names differ).
_PROFILE_TO_CONFIG = {
    "pricing_notes": "prices",
    "location": "locations",
    "escalation_rules": "escalation_triggers",
}


def save_profile(tenant_id: str, patch: dict) -> dict:
    """Persist a profile patch through the versioned config repository (one writable
    store). Returns the projected BusinessProfile so callers see a consistent shape."""
    from . import config_repo
    cfg_patch: dict = {}
    for key, val in (patch or {}).items():
        if key in ("tenant_id", "id"):
            continue
        cfg_patch[_PROFILE_TO_CONFIG.get(key, key)] = val
    cfg = config_repo.save(tenant_id, cfg_patch, updated_by=(patch or {}).get("updated_by", ""))
    return config_repo.to_business_profile(cfg)


def profile_is_configured(tenant_id: str) -> bool:
    from . import config_repo
    if config_repo.get_active(tenant_id) is not None:
        return config_repo.is_configured(tenant_id)
    p = get_profile(tenant_id)
    return bool(p.get("business_name") or p.get("services") or p.get("faqs")
               or p.get("hours") or p.get("policies"))


# ── knowledge base CRUD ───────────────────────────────────────────────────────

def list_knowledge(tenant_id: str) -> list[dict]:
    return stores.knowledge().list(tenant_id)


def create_knowledge(tenant_id: str, *, title: str = "", content: str = "",
                     category: str = "general", tags: Optional[list[str]] = None) -> dict:
    item = KnowledgeItem(tenant_id=tenant_id, title=title, content=content,
                         category=category, tags=tags or []).model_dump()
    return stores.knowledge().put(tenant_id, item)


def update_knowledge(tenant_id: str, item_id: str, patch: dict) -> Optional[dict]:
    item = stores.knowledge().get(tenant_id, item_id)
    if item is None:
        return None
    for key, val in (patch or {}).items():
        if key in ("tenant_id", "id", "created_at"):
            continue
        if val is not None:
            item[key] = val
    return stores.knowledge().put(tenant_id, item)


def delete_knowledge(tenant_id: str, item_id: str) -> bool:
    return stores.knowledge().delete(tenant_id, item_id)


# ── retrieval ─────────────────────────────────────────────────────────────────

def _profile_snippets(profile: dict) -> list[tuple[str, str]]:
    """Turn structured profile fields into (label, text) answerable snippets."""
    out: list[tuple[str, str]] = []
    if profile.get("hours"):
        out.append(("hours", f"Our business hours: {profile['hours']}"))
    if profile.get("services"):
        out.append(("services", "Services we offer: " + ", ".join(profile["services"])))
    if profile.get("pricing_notes"):
        out.append(("pricing", profile["pricing_notes"]))
    if profile.get("location") or profile.get("address"):
        out.append(("location", f"You can find us at {profile.get('address') or profile.get('location')}."))
    if profile.get("policies"):
        out.append(("policies", profile["policies"]))
    if profile.get("process"):
        out.append(("process", profile["process"]))
    contact_bits = [b for b in (profile.get("phone"), profile.get("email"), profile.get("website")) if b]
    if contact_bits:
        out.append(("contact", "You can reach us at " + ", ".join(contact_bits) + "."))
    return out


def answer_question(tenant_id: str, question: str) -> Optional[dict]:
    """Best keyword-overlap answer from FAQs + knowledge + profile. None if no
    configured source is relevant (caller must NOT hallucinate)."""
    q = _tokens(question)
    if not q:
        return None
    profile = get_profile(tenant_id)

    candidates: list[tuple[float, str, str, str]] = []  # (score, answer, source, ref)

    for faq in profile.get("faqs", []) or []:
        qq, aa = faq.get("q", ""), faq.get("a", "")
        overlap = len(q & _tokens(qq + " " + aa))
        if overlap:
            candidates.append((overlap + 0.5, aa, "faq", qq))

    for item in list_knowledge(tenant_id):
        overlap = len(q & _tokens(item.get("title", "") + " " + item.get("content", "")))
        if overlap:
            candidates.append((float(overlap), item.get("content", ""), "knowledge", item.get("id", "")))

    for label, text in _profile_snippets(profile):
        overlap = len(q & _tokens(label + " " + text))
        if overlap:
            candidates.append((overlap + 0.25, text, f"profile:{label}", label))

    if not candidates:
        return None
    candidates.sort(key=lambda c: c[0], reverse=True)
    best = candidates[0]
    return {"answer": best[1], "source": best[2], "ref": best[3], "score": best[0]}
