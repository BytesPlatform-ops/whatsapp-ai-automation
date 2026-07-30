"""Billing product registry — agent-neutral, server-authoritative.

Stable product identifiers mapped to their operation/usage-counter keys. This is
the ONLY place that defines valid product ids for the billing system. The registry
is used server-side to:
  1. Validate a requested ``product`` filter (unknown → treat as "all", never 422).
  2. Attribute ledger/usage rows to a product by operation_type or source_product.
  3. Supply the frontend's billingProducts.ts with canonical product ids (mirrored).

Never trust a product id from the browser directly — validate against PRODUCT_IDS.
"""

from __future__ import annotations

from typing import Dict, FrozenSet, List, Optional

# ── canonical product ids ────────────────────────────────────────────────────────
# Must match the productId values in landing/lib/pixie-lab/billingProducts.ts.
PRODUCT_IDS: FrozenSet[str] = frozenset([
    "content_agent",
    "ai_influencer",
    "seo_agent",
    "social_marketer",
    "ai_receptionist",
])


class ProductSpec:
    """Server-side specification for one billing product."""

    def __init__(
        self,
        product_id: str,
        display_name: str,
        agent_backend_key: str,                 # matches PixieUnit.backendKey in agents.ts
        operation_types: List[str],             # reservation.operation_type values
        source_products: List[str],             # reservation.source_product values
        usage_counter_keys: List[str],          # keys in usage._COUNTERS
        access_key: str,                        # plans.access dict key for entitlement
        implemented: bool = True,
        billing_active: bool = True,
    ) -> None:
        self.product_id = product_id
        self.display_name = display_name
        self.agent_backend_key = agent_backend_key
        self.operation_types: FrozenSet[str] = frozenset(operation_types)
        self.source_products: FrozenSet[str] = frozenset(source_products)
        self.usage_counter_keys: List[str] = list(usage_counter_keys)
        self.access_key = access_key
        self.implemented = implemented
        self.billing_active = billing_active


PRODUCT_CATALOG: Dict[str, ProductSpec] = {
    "content_agent": ProductSpec(
        product_id="content_agent",
        display_name="Content Agent",
        agent_backend_key="content",
        operation_types=["content_text"],
        source_products=["content_agent"],
        usage_counter_keys=["content_text", "documents"],
        access_key="content_agent",
        implemented=True,
        billing_active=True,
    ),
    "ai_influencer": ProductSpec(
        product_id="ai_influencer",
        display_name="AI Influencer",
        agent_backend_key="content",
        operation_types=["influencer_idea", "influencer_script", "influencer_video"],
        source_products=["ai_influencer", "content_creator"],
        usage_counter_keys=["influencer_idea", "influencer_script", "influencer_video",
                            "influencer_profiles", "publish_jobs", "connected_accounts", "scheduled_jobs"],
        access_key="ai_influencer",
        implemented=True,
        billing_active=True,
    ),
    "seo_agent": ProductSpec(
        product_id="seo_agent",
        display_name="SEO Agent",
        agent_backend_key="seo",
        operation_types=["seo_audit", "seo_keyword_research", "seo_fix"],
        source_products=["seo_agent"],
        usage_counter_keys=["seo_audits", "seo_jobs"],
        # plans.access doesn't yet have a dedicated seo flag — default to True (advisory)
        access_key="",
        implemented=True,
        billing_active=True,
    ),
    "social_marketer": ProductSpec(
        product_id="social_marketer",
        display_name="Marketing",
        agent_backend_key="marketing",
        operation_types=["marketing_campaign", "marketing_brief"],
        source_products=["social_marketer", "marketing"],
        usage_counter_keys=["marketing_jobs"],
        access_key="",
        implemented=False,
        billing_active=False,
    ),
    "ai_receptionist": ProductSpec(
        product_id="ai_receptionist",
        display_name="AI Receptionist",
        agent_backend_key="receptionist",
        operation_types=[
            "receptionist_classify", "receptionist_response_plan", "receptionist_reply",
            "receptionist_summarize", "receptionist_knowledge_ingest",
            "receptionist_knowledge_embed", "receptionist_knowledge_retrieve",
            "receptionist_approval_exec", "receptionist_escalation_notify",
            "receptionist_reminder_prep", "receptionist_follow_up_prep",
            "receptionist_worker_op", "receptionist_gmail_op", "receptionist_calendar_op",
            "receptionist_whatsapp_op", "receptionist_instagram_op", "receptionist_messenger_op",
            "receptionist_sms_op", "receptionist_telegram_op", "receptionist_voice_op",
        ],
        source_products=["ai_receptionist", "receptionist"],
        usage_counter_keys=[
            "receptionist_conversations", "receptionist_ai_turns", "receptionist_summaries",
            "receptionist_knowledge_ingestions", "receptionist_escalations",
            "receptionist_reminders", "receptionist_follow_ups",
        ],
        access_key="ai_receptionist",
        implemented=True,
        billing_active=True,
    ),
}


# ── validation helpers ───────────────────────────────────────────────────────────

def validate_product(product: Optional[str]) -> Optional[str]:
    """Return the canonical product id, or None (= "all products") for unknown/empty.

    Never raises — an unknown value is silently normalized to None so callers can
    safely pass any browser-supplied string.
    """
    if not product or not isinstance(product, str):
        return None
    p = product.strip()
    return p if p in PRODUCT_IDS else None


def get_product(product_id: str) -> Optional[ProductSpec]:
    return PRODUCT_CATALOG.get(product_id)


def all_products() -> List[ProductSpec]:
    return list(PRODUCT_CATALOG.values())


# ── attribution: map a reservation / usage row to a product ─────────────────────

def attribute_by_operation(operation_type: str) -> Optional[str]:
    """Given a reservation.operation_type, return the product id (or None)."""
    for spec in PRODUCT_CATALOG.values():
        if operation_type in spec.operation_types:
            return spec.product_id
    return None


def attribute_by_source_product(source_product: str) -> Optional[str]:
    """Given a reservation.source_product, return the canonical product id (or None)."""
    for spec in PRODUCT_CATALOG.values():
        if source_product in spec.source_products:
            return spec.product_id
    return None


def counter_keys_for_product(product_id: str) -> Optional[List[str]]:
    """Return the usage counter keys that belong to this product, or None if unknown."""
    spec = PRODUCT_CATALOG.get(product_id)
    return list(spec.usage_counter_keys) if spec else None
