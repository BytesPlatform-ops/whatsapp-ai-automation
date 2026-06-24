"""Per-tenant onboarding store: save a business's answers, and compile them into
the receptionist prompt's BUSINESS INFO variables.

Answers come from (a) a small fixed CORE set (maps 1:1 to prompt vars) and
(b) a lean subset of the industry question bank (compiled by category into the
right prompt var). Stored as JSON under data/tenants/ (gitignored).
"""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

from .bank import question_by_id

_DIR = Path(__file__).resolve().parent.parent / "data" / "tenants"

# Fixed core fields shown in onboarding — keys ARE the prompt variable names.
CORE_FIELDS = [
    {"key": "BUSINESS_NAME", "label": "Business name", "type": "short_text", "required": True},
    {"key": "BUSINESS_TYPE", "label": "What does your business do?", "type": "short_text", "required": True},
    {"key": "LOCATION", "label": "Location / service area", "type": "short_text", "required": False},
    {"key": "HOURS", "label": "Business hours", "type": "long_text", "required": True},
    {"key": "TIMEZONE", "label": "Time zone (e.g. Asia/Karachi)", "type": "short_text", "required": False},
    {"key": "CONTACT_INFO", "label": "Contact (phone / email)", "type": "short_text", "required": True},
    {"key": "LANGUAGES", "label": "Languages to reply in", "type": "short_text", "required": False},
    {"key": "BRAND_TONE", "label": "Tone / personality", "type": "single_select", "required": False,
     "options": ["warm & friendly", "professional", "luxury / premium", "fast & direct", "sales-focused", "casual"]},
    {"key": "HUMAN_HANDOFF", "label": "When should it hand off to a human? (and to whom)", "type": "long_text", "required": False},
]

PROMPT_VARS = [
    "BUSINESS_NAME", "BUSINESS_TYPE", "BRAND_TONE", "LANGUAGES", "HOURS", "TIMEZONE", "LOCATION",
    "CONTACT_INFO", "WEBSITE_LINKS", "SERVICES", "PRICING", "DISCOUNT_RULES", "MOQ_RULES",
    "BOOKING_RULES", "STAFF_DEPARTMENTS", "STAFF_AVAILABILITY", "CALL_ROUTING_RULES", "WAITLIST_RULES",
    "REMINDER_RULES", "INTAKE_QUESTIONS", "PAYMENT_RULES", "STATUS_RULES", "POLICIES",
    "REFUND_RETURN_RULES", "CANCELLATION_RULES", "URGENT_HANDLING_RULES", "CUSTOMER_DATA_FIELDS",
    "FOLLOW_UP_RULES", "UPSELL_CROSS_SELL_RULES", "SPAM_ABUSE_RULES", "HUMAN_HANDOFF",
]

# Bank category -> which prompt var the answer enriches.
CATEGORY_TO_VAR = {
    "Services / Products": "SERVICES",
    "Pricing / Packages": "PRICING",
    "Payments / Deposits / Refunds": "PAYMENT_RULES",
    "Booking / Appointment Rules": "BOOKING_RULES",
    "Customer Qualification": "CUSTOMER_DATA_FIELDS",
    "Customer Data Collection": "CUSTOMER_DATA_FIELDS",
    "FAQs": "POLICIES",
    "Staff / Team / Availability": "STAFF_DEPARTMENTS",
    "Follow-up Rules": "FOLLOW_UP_RULES",
    "Sales / Upsell Opportunities": "UPSELL_CROSS_SELL_RULES",
    "Complaints / Escalation": "HUMAN_HANDOFF",
    "Compliance / Safety": "URGENT_HANDLING_RULES",
    "Industry-Specific Rules": "POLICIES",
    "AI Tone / Personality": "BRAND_TONE",
}


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "biz").lower()).strip("-")[:24] or "biz"
    return f"{s}-{uuid.uuid4().hex[:6]}"


def save_tenant(*, business_name: str, industry: str, core: dict, answers: list[dict]) -> str:
    """Persist a new tenant's onboarding answers. Returns the new tenant_id."""
    tenant_id = _slug(business_name)
    _DIR.mkdir(parents=True, exist_ok=True)
    profile = {
        "tenant_id": tenant_id,
        "industry": industry,
        "core": {k: v for k, v in core.items() if v not in (None, "")},
        "answers": [a for a in answers if a.get("value") not in (None, "")],
    }
    (_DIR / f"{tenant_id}.json").write_text(json.dumps(profile, indent=2, ensure_ascii=False), encoding="utf-8")
    return tenant_id


def load_profile(tenant_id: str) -> dict | None:
    p = _DIR / f"{tenant_id}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def build_prompt_vars(tenant_id: str) -> dict | None:
    """Compile a saved profile into the receptionist prompt's BUSINESS INFO vars."""
    profile = load_profile(tenant_id)
    if not profile:
        return None

    values = {v: "Not specified" for v in PROMPT_VARS}
    # Core fields map 1:1 to prompt vars.
    for k, v in (profile.get("core") or {}).items():
        if k in values and v:
            values[k] = v

    # Compile bank answers into their category's var.
    buckets: dict[str, list[str]] = {}
    for a in profile.get("answers", []):
        q = question_by_id(a.get("id", ""))
        if not q or not a.get("value"):
            continue
        var = CATEGORY_TO_VAR.get(q["category"], "POLICIES")
        buckets.setdefault(var, []).append(f"• {q['question']} → {a['value']}")

    for var, lines in buckets.items():
        compiled = "\n".join(lines)
        if values.get(var, "Not specified") in ("Not specified", "", None):
            values[var] = compiled
        else:
            values[var] = f"{values[var]}\n{compiled}"

    return values


def list_tenants() -> list[dict]:
    if not _DIR.exists():
        return []
    out = []
    for p in sorted(_DIR.glob("*.json")):
        try:
            d = json.loads(p.read_text())
            out.append({"tenant_id": d["tenant_id"], "business_name": d.get("core", {}).get("BUSINESS_NAME", d["tenant_id"]), "industry": d.get("industry")})
        except Exception:
            continue
    return out
