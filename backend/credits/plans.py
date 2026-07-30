"""Server-authoritative plan catalog + entitlement checks.

Plans are internal capability bundles (access flags + quantitative limits + monthly
included credits), NOT UI labels, and are resolved from SERVER state only — a plan id
sent by the browser is never trusted (rules 6/7). Stripe price ids map to plans here,
server-side (Task 16). One reusable service answers: is this workspace allowed to do
X, what limit applies, and what remediation is needed.

Enforcement is gated by ``BILLING_ENFORCEMENT_ENABLED``: while off, checks are
advisory (``allowed=True`` with an ``enforced=False`` note) so this can ship before
durable migrations exist without blocking any existing flow.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional

from . import config

# Sentinel: no numeric limit (unlimited).
UNLIMITED = -1


@dataclass(frozen=True)
class Plan:
    id: str
    name: str
    monthly_credits: int                     # whole credits granted each period
    access: Dict[str, bool] = field(default_factory=dict)
    limits: Dict[str, int] = field(default_factory=dict)

    def allows(self, feature: str) -> bool:
        return bool(self.access.get(feature, False))

    def limit(self, key: str) -> int:
        return int(self.limits.get(key, 0))


# Access-flag keys.
ACCESS_KEYS = (
    "content_agent", "ai_influencer", "publishing", "live_publishing",
    "video_generation", "advanced_content_types", "publishing_calendar",
    "byok", "premium_video_models", "higher_resolution", "priority_processing",
    "real_provider_access", "ai_receptionist",
)
# Quantitative-limit keys.
LIMIT_KEYS = (
    "monthly_text_generations", "monthly_video_generations", "max_documents",
    "max_variations", "connected_accounts", "scheduled_jobs",
    "active_influencer_profiles", "concurrent_provider_jobs",
    "version_history_depth", "team_members",
)


# ── SEO Agent plan limits (server-authoritative; keys match seo/metering_search.py) ──
# UNLIMITED (-1) never blocks. Free is intentionally minimal; off-site + outreach are
# gated to paid tiers. Callers pass these keys to check_limit()/enforce_seo_limit().
_SEO_LIMITS_FREE = {
    "seo_sites": 1, "seo_pages_per_crawl": 50, "seo_crawls_per_period": 5,
    "seo_crawl_history": 5, "seo_pagespeed_checks": 20, "seo_history_retention_days": 30,
    "seo_keyword_projects": 1, "seo_keywords_per_project": 25, "seo_tracked_keywords": 10,
    "seo_rank_check_frequency_days": 30, "seo_competitors": 1,
    "seo_gsc_properties": 1, "seo_ga4_properties": 1,
    "seo_content_briefs": 2, "seo_ai_recommendations": 10, "seo_reports": 3,
    "seo_backlink_sites": 0, "seo_backlink_stored": 0, "seo_backlink_competitors": 0,
    "seo_backlink_gap_reports": 0, "seo_backlink_sync_frequency_days": 0,
    "seo_locations": 1, "seo_gbp_connections": 0, "seo_local_keywords": 5,
    "seo_local_rank_checks": 10, "seo_geo_grid_checks": 0, "seo_reviews_processed": 0,
    "seo_citation_checks": 5, "seo_schema_proposals": 2,
    "seo_outreach_contacts": 0, "seo_outreach_campaigns": 0, "seo_outreach_drafts": 0,
    "seo_outreach_emails": 0, "seo_outreach_followups": 0, "seo_outreach_verifications": 0,
}
_SEO_LIMITS_STARTER = {
    "seo_sites": 3, "seo_pages_per_crawl": 500, "seo_crawls_per_period": 50,
    "seo_crawl_history": 50, "seo_pagespeed_checks": 200, "seo_history_retention_days": 180,
    "seo_keyword_projects": 5, "seo_keywords_per_project": 200, "seo_tracked_keywords": 100,
    "seo_rank_check_frequency_days": 7, "seo_competitors": 3,
    "seo_gsc_properties": 3, "seo_ga4_properties": 3,
    "seo_content_briefs": 25, "seo_ai_recommendations": 200, "seo_reports": 50,
    "seo_backlink_sites": 1, "seo_backlink_stored": 5000, "seo_backlink_competitors": 3,
    "seo_backlink_gap_reports": 10, "seo_backlink_sync_frequency_days": 7,
    "seo_locations": 3, "seo_gbp_connections": 3, "seo_local_keywords": 50,
    "seo_local_rank_checks": 200, "seo_geo_grid_checks": 0, "seo_reviews_processed": 500,
    "seo_citation_checks": 50, "seo_schema_proposals": 25,
    "seo_outreach_contacts": 500, "seo_outreach_campaigns": 10, "seo_outreach_drafts": 100,
    "seo_outreach_emails": 50, "seo_outreach_followups": 100, "seo_outreach_verifications": 100,
}
_SEO_LIMITS_PRO = {
    "seo_sites": 25, "seo_pages_per_crawl": 5000, "seo_crawls_per_period": UNLIMITED,
    "seo_crawl_history": UNLIMITED, "seo_pagespeed_checks": UNLIMITED, "seo_history_retention_days": UNLIMITED,
    "seo_keyword_projects": UNLIMITED, "seo_keywords_per_project": UNLIMITED, "seo_tracked_keywords": 2000,
    "seo_rank_check_frequency_days": 1, "seo_competitors": 25,
    "seo_gsc_properties": 25, "seo_ga4_properties": 25,
    "seo_content_briefs": UNLIMITED, "seo_ai_recommendations": UNLIMITED, "seo_reports": UNLIMITED,
    "seo_backlink_sites": 25, "seo_backlink_stored": 100000, "seo_backlink_competitors": 25,
    "seo_backlink_gap_reports": UNLIMITED, "seo_backlink_sync_frequency_days": 1,
    "seo_locations": 50, "seo_gbp_connections": 50, "seo_local_keywords": 1000,
    "seo_local_rank_checks": UNLIMITED, "seo_geo_grid_checks": 1000, "seo_reviews_processed": UNLIMITED,
    "seo_citation_checks": 1000, "seo_schema_proposals": UNLIMITED,
    "seo_outreach_contacts": 10000, "seo_outreach_campaigns": UNLIMITED, "seo_outreach_drafts": UNLIMITED,
    "seo_outreach_emails": 500, "seo_outreach_followups": UNLIMITED, "seo_outreach_verifications": UNLIMITED,
}


# ── AI Receptionist plan limits (server-authoritative; keys match receptionist limits) ──
# UNLIMITED (-1) never blocks. Zero means the capability is disabled on that plan.
_RECEPTIONIST_LIMITS_FREE = {
    "receptionist_widget_sites": 1, "receptionist_monthly_conversations": 50,
    "receptionist_monthly_ai_turns": 200, "receptionist_stored_contacts": 100,
    "receptionist_stored_conversations": 200, "receptionist_knowledge_sources": 3,
    "receptionist_knowledge_storage_mb": 5, "receptionist_monthly_knowledge_ingestions": 5,
    "receptionist_monthly_summaries": 50, "receptionist_monthly_escalations": 20,
    "receptionist_pending_approvals": 10, "receptionist_scheduled_reminders": 10,
    "receptionist_scheduled_follow_ups": 10, "receptionist_human_assignees": 1,
    "receptionist_retention_days": 30,
    "receptionist_gmail_accounts": 0, "receptionist_gmail_monthly_replies": 0,
    "receptionist_calendar_accounts": 0, "receptionist_monthly_bookings": 0,
    "receptionist_monthly_reschedules": 0, "receptionist_monthly_cancellations": 0,
    "receptionist_whatsapp_numbers": 0, "receptionist_whatsapp_wabas": 0,
    "receptionist_whatsapp_monthly_inbound": 0, "receptionist_whatsapp_monthly_freeform": 0,
    "receptionist_whatsapp_monthly_templates": 0, "receptionist_whatsapp_monthly_interactive": 0,
    "receptionist_instagram_accounts": 0, "receptionist_instagram_monthly_inbound": 0,
    "receptionist_instagram_monthly_replies": 0, "receptionist_instagram_monthly_media": 0,
    "receptionist_messenger_pages": 0, "receptionist_messenger_monthly_inbound": 0,
    "receptionist_messenger_monthly_replies": 0, "receptionist_messenger_monthly_interactive": 0,
    "receptionist_messenger_monthly_media": 0,
    "receptionist_sms_numbers": 0, "receptionist_sms_monthly_inbound": 0,
    "receptionist_sms_monthly_replies": 0, "receptionist_sms_monthly_segments": 0,
    "receptionist_sms_monthly_mms": 0, "receptionist_sms_stored_conversations": 0,
    "receptionist_sms_monthly_reminders": 0,
    "receptionist_telegram_bots": 0, "receptionist_telegram_business_connections": 0,
    "receptionist_telegram_monthly_inbound": 0, "receptionist_telegram_monthly_replies": 0,
    "receptionist_telegram_monthly_business_messages": 0, "receptionist_telegram_monthly_callbacks": 0,
    "receptionist_telegram_monthly_media": 0, "receptionist_telegram_stored_conversations": 0,
    "receptionist_telegram_monthly_reminders": 0,
    "receptionist_voice_accounts": 0, "receptionist_voice_numbers": 0,
    "receptionist_voice_concurrent_calls": 0, "receptionist_voice_monthly_inbound_minutes": 0,
    "receptionist_voice_monthly_outbound_minutes": 0, "receptionist_voice_monthly_transfer_minutes": 0,
    "receptionist_voice_monthly_recorded_minutes": 0, "receptionist_voice_monthly_analyses": 0,
    "receptionist_voice_monthly_callbacks": 0, "receptionist_voice_stored_calls": 0,
    "receptionist_voice_max_call_seconds": 0,
}
_RECEPTIONIST_LIMITS_STARTER = {
    "receptionist_widget_sites": 3, "receptionist_monthly_conversations": 1000,
    "receptionist_monthly_ai_turns": 5000, "receptionist_stored_contacts": 5000,
    "receptionist_stored_conversations": 5000, "receptionist_knowledge_sources": 25,
    "receptionist_knowledge_storage_mb": 100, "receptionist_monthly_knowledge_ingestions": 100,
    "receptionist_monthly_summaries": 1000, "receptionist_monthly_escalations": 500,
    "receptionist_pending_approvals": 100, "receptionist_scheduled_reminders": 500,
    "receptionist_scheduled_follow_ups": 500, "receptionist_human_assignees": 3,
    "receptionist_retention_days": 180,
    "receptionist_gmail_accounts": 1, "receptionist_gmail_monthly_replies": 500,
    "receptionist_calendar_accounts": 1, "receptionist_monthly_bookings": 200,
    "receptionist_monthly_reschedules": 200, "receptionist_monthly_cancellations": 200,
    "receptionist_whatsapp_numbers": 1, "receptionist_whatsapp_wabas": 1,
    "receptionist_whatsapp_monthly_inbound": 2000, "receptionist_whatsapp_monthly_freeform": 1000,
    "receptionist_whatsapp_monthly_templates": 500, "receptionist_whatsapp_monthly_interactive": 500,
    "receptionist_instagram_accounts": 1, "receptionist_instagram_monthly_inbound": 2000,
    "receptionist_instagram_monthly_replies": 1000, "receptionist_instagram_monthly_media": 500,
    "receptionist_messenger_pages": 1, "receptionist_messenger_monthly_inbound": 2000,
    "receptionist_messenger_monthly_replies": 1000, "receptionist_messenger_monthly_interactive": 500,
    "receptionist_messenger_monthly_media": 500,
    "receptionist_sms_numbers": 1, "receptionist_sms_monthly_inbound": 2000,
    "receptionist_sms_monthly_replies": 1000, "receptionist_sms_monthly_segments": 3000,
    "receptionist_sms_monthly_mms": 100, "receptionist_sms_stored_conversations": 5000,
    "receptionist_sms_monthly_reminders": 500,
    "receptionist_telegram_bots": 1, "receptionist_telegram_business_connections": 1,
    "receptionist_telegram_monthly_inbound": 3000, "receptionist_telegram_monthly_replies": 1500,
    "receptionist_telegram_monthly_business_messages": 1500, "receptionist_telegram_monthly_callbacks": 2000,
    "receptionist_telegram_monthly_media": 500, "receptionist_telegram_stored_conversations": 5000,
    "receptionist_telegram_monthly_reminders": 500,
    "receptionist_voice_accounts": 1, "receptionist_voice_numbers": 1,
    "receptionist_voice_concurrent_calls": 1, "receptionist_voice_monthly_inbound_minutes": 500,
    "receptionist_voice_monthly_outbound_minutes": 100, "receptionist_voice_monthly_transfer_minutes": 100,
    "receptionist_voice_monthly_recorded_minutes": 0, "receptionist_voice_monthly_analyses": 200,
    "receptionist_voice_monthly_callbacks": 100, "receptionist_voice_stored_calls": 5000,
    "receptionist_voice_max_call_seconds": 600,
}
_RECEPTIONIST_LIMITS_PRO = {
    "receptionist_widget_sites": 25, "receptionist_monthly_conversations": UNLIMITED,
    "receptionist_monthly_ai_turns": UNLIMITED, "receptionist_stored_contacts": UNLIMITED,
    "receptionist_stored_conversations": UNLIMITED, "receptionist_knowledge_sources": 200,
    "receptionist_knowledge_storage_mb": 2000, "receptionist_monthly_knowledge_ingestions": UNLIMITED,
    "receptionist_monthly_summaries": UNLIMITED, "receptionist_monthly_escalations": UNLIMITED,
    "receptionist_pending_approvals": UNLIMITED, "receptionist_scheduled_reminders": UNLIMITED,
    "receptionist_scheduled_follow_ups": UNLIMITED, "receptionist_human_assignees": 10,
    "receptionist_retention_days": UNLIMITED,
    "receptionist_gmail_accounts": 3, "receptionist_gmail_monthly_replies": UNLIMITED,
    "receptionist_calendar_accounts": 3, "receptionist_monthly_bookings": UNLIMITED,
    "receptionist_monthly_reschedules": UNLIMITED, "receptionist_monthly_cancellations": UNLIMITED,
    "receptionist_whatsapp_numbers": 5, "receptionist_whatsapp_wabas": 3,
    "receptionist_whatsapp_monthly_inbound": UNLIMITED, "receptionist_whatsapp_monthly_freeform": UNLIMITED,
    "receptionist_whatsapp_monthly_templates": UNLIMITED, "receptionist_whatsapp_monthly_interactive": UNLIMITED,
    "receptionist_instagram_accounts": 5, "receptionist_instagram_monthly_inbound": UNLIMITED,
    "receptionist_instagram_monthly_replies": UNLIMITED, "receptionist_instagram_monthly_media": UNLIMITED,
    "receptionist_messenger_pages": 5, "receptionist_messenger_monthly_inbound": UNLIMITED,
    "receptionist_messenger_monthly_replies": UNLIMITED, "receptionist_messenger_monthly_interactive": UNLIMITED,
    "receptionist_messenger_monthly_media": UNLIMITED,
    "receptionist_sms_numbers": 5, "receptionist_sms_monthly_inbound": UNLIMITED,
    "receptionist_sms_monthly_replies": UNLIMITED, "receptionist_sms_monthly_segments": UNLIMITED,
    "receptionist_sms_monthly_mms": UNLIMITED, "receptionist_sms_stored_conversations": UNLIMITED,
    "receptionist_sms_monthly_reminders": UNLIMITED,
    "receptionist_telegram_bots": 5, "receptionist_telegram_business_connections": 5,
    "receptionist_telegram_monthly_inbound": UNLIMITED, "receptionist_telegram_monthly_replies": UNLIMITED,
    "receptionist_telegram_monthly_business_messages": UNLIMITED, "receptionist_telegram_monthly_callbacks": UNLIMITED,
    "receptionist_telegram_monthly_media": UNLIMITED, "receptionist_telegram_stored_conversations": UNLIMITED,
    "receptionist_telegram_monthly_reminders": UNLIMITED,
    "receptionist_voice_accounts": 1, "receptionist_voice_numbers": 5,
    "receptionist_voice_concurrent_calls": 10, "receptionist_voice_monthly_inbound_minutes": UNLIMITED,
    "receptionist_voice_monthly_outbound_minutes": UNLIMITED, "receptionist_voice_monthly_transfer_minutes": UNLIMITED,
    "receptionist_voice_monthly_recorded_minutes": UNLIMITED, "receptionist_voice_monthly_analyses": UNLIMITED,
    "receptionist_voice_monthly_callbacks": UNLIMITED, "receptionist_voice_stored_calls": UNLIMITED,
    "receptionist_voice_max_call_seconds": 1800,
}


PLAN_CATALOG: Dict[str, Plan] = {
    "free": Plan(
        id="free", name="Free", monthly_credits=0,
        access={"content_agent": True, "publishing": True, "publishing_calendar": True,
                "ai_influencer": False, "live_publishing": False, "video_generation": False,
                "real_provider_access": False, "byok": False, "ai_receptionist": True},
        limits={"monthly_text_generations": 10, "monthly_video_generations": 0, "max_documents": 20,
                "max_variations": 1, "connected_accounts": 1, "scheduled_jobs": 3,
                "active_influencer_profiles": 0, "concurrent_provider_jobs": 1,
                "version_history_depth": 3, "team_members": 1, **_SEO_LIMITS_FREE,
                **_RECEPTIONIST_LIMITS_FREE},
    ),
    "starter": Plan(
        id="starter", name="Starter", monthly_credits=2000,
        access={"content_agent": True, "publishing": True, "publishing_calendar": True,
                "ai_influencer": True, "live_publishing": False, "video_generation": True,
                "real_provider_access": True, "advanced_content_types": True, "byok": True,
                "ai_receptionist": True},
        limits={"monthly_text_generations": 200, "monthly_video_generations": 10, "max_documents": 200,
                "max_variations": 3, "connected_accounts": 3, "scheduled_jobs": 50,
                "active_influencer_profiles": 1, "concurrent_provider_jobs": 2,
                "version_history_depth": 20, "team_members": 2, **_SEO_LIMITS_STARTER,
                **_RECEPTIONIST_LIMITS_STARTER},
    ),
    "pro": Plan(
        id="pro", name="Pro", monthly_credits=10000,
        access={"content_agent": True, "publishing": True, "publishing_calendar": True,
                "ai_influencer": True, "live_publishing": True, "video_generation": True,
                "real_provider_access": True, "advanced_content_types": True, "byok": True,
                "premium_video_models": True, "higher_resolution": True, "priority_processing": True,
                "ai_receptionist": True},
        limits={"monthly_text_generations": UNLIMITED, "monthly_video_generations": 100, "max_documents": UNLIMITED,
                "max_variations": 5, "connected_accounts": 10, "scheduled_jobs": UNLIMITED,
                "active_influencer_profiles": 5, "concurrent_provider_jobs": 5,
                "version_history_depth": UNLIMITED, "team_members": 10, **_SEO_LIMITS_PRO,
                **_RECEPTIONIST_LIMITS_PRO},
    ),
}

FALLBACK_PLAN_ID = "free"

# Stripe price id → internal plan id. Populated from server config (Task 16);
# a browser-supplied plan/price is mapped HERE, never trusted directly.
PRICE_TO_PLAN: Dict[str, str] = {}


def get_plan(plan_id: str) -> Plan:
    """Resolve a plan by internal id; unknown/empty → fallback (free)."""
    return PLAN_CATALOG.get(plan_id or FALLBACK_PLAN_ID, PLAN_CATALOG[FALLBACK_PLAN_ID])


def plan_for_price(stripe_price_id: str) -> Optional[str]:
    return PRICE_TO_PLAN.get(stripe_price_id)


def resolve_plan_id(tenant_id: str) -> str:
    """Workspace's plan from SERVER state (the wallet's plan_id, set by Stripe sync /
    monthly grant). Never from the browser. Falls back to free."""
    try:
        from .wallet import get_wallet_repository
        cached = get_wallet_repository().get_cached(tenant_id)
        if cached and cached.plan_id and cached.plan_id in PLAN_CATALOG:
            return cached.plan_id
    except Exception:
        pass
    return FALLBACK_PLAN_ID


def plan_for_workspace(tenant_id: str) -> Plan:
    return get_plan(resolve_plan_id(tenant_id))


# ── entitlement checks ──────────────────────────────────────────────────────────
def check_feature(tenant_id: str, feature: str) -> dict:
    """Is this workspace entitled to a feature? Advisory unless enforcement is on."""
    plan = plan_for_workspace(tenant_id)
    allowed = plan.allows(feature)
    enforced = config.billing_enforcement_enabled()
    return {
        "feature": feature,
        "plan_id": plan.id,
        "entitled": allowed,
        "allowed": allowed or not enforced,   # advisory pass-through when not enforced
        "enforced": enforced,
        "reason": "" if allowed else "feature_not_entitled",
        "remediation": "" if allowed else "upgrade_plan",
    }


def check_limit(tenant_id: str, key: str, used: int) -> dict:
    """Is a quantitative limit satisfied given current usage? UNLIMITED always passes."""
    plan = plan_for_workspace(tenant_id)
    lim = plan.limit(key)
    enforced = config.billing_enforcement_enabled()
    within = lim == UNLIMITED or used < lim
    return {
        "limit_key": key,
        "plan_id": plan.id,
        "limit": lim,
        "used": used,
        "remaining": UNLIMITED if lim == UNLIMITED else max(0, lim - used),
        "within_limit": within,
        "allowed": within or not enforced,
        "enforced": enforced,
        "reason": "" if within else "usage_limit_reached",
        "remediation": "" if within else "upgrade_plan",
    }


def plan_summary(plan: Plan) -> dict:
    """Frontend-safe plan descriptor (no pricing internals)."""
    return {"id": plan.id, "name": plan.name, "monthly_credits": plan.monthly_credits,
            "access": dict(plan.access), "limits": dict(plan.limits)}


def catalog_summary() -> list:
    return [plan_summary(p) for p in PLAN_CATALOG.values()]
