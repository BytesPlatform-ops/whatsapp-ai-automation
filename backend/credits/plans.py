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
    "real_provider_access",
)
# Quantitative-limit keys.
LIMIT_KEYS = (
    "monthly_text_generations", "monthly_video_generations", "max_documents",
    "max_variations", "connected_accounts", "scheduled_jobs",
    "active_influencer_profiles", "concurrent_provider_jobs",
    "version_history_depth", "team_members",
)


PLAN_CATALOG: Dict[str, Plan] = {
    "free": Plan(
        id="free", name="Free", monthly_credits=0,
        access={"content_agent": True, "publishing": True, "publishing_calendar": True,
                "ai_influencer": False, "live_publishing": False, "video_generation": False,
                "real_provider_access": False, "byok": False},
        limits={"monthly_text_generations": 10, "monthly_video_generations": 0, "max_documents": 20,
                "max_variations": 1, "connected_accounts": 1, "scheduled_jobs": 3,
                "active_influencer_profiles": 0, "concurrent_provider_jobs": 1,
                "version_history_depth": 3, "team_members": 1},
    ),
    "starter": Plan(
        id="starter", name="Starter", monthly_credits=2000,
        access={"content_agent": True, "publishing": True, "publishing_calendar": True,
                "ai_influencer": True, "live_publishing": False, "video_generation": True,
                "real_provider_access": True, "advanced_content_types": True, "byok": True},
        limits={"monthly_text_generations": 200, "monthly_video_generations": 10, "max_documents": 200,
                "max_variations": 3, "connected_accounts": 3, "scheduled_jobs": 50,
                "active_influencer_profiles": 1, "concurrent_provider_jobs": 2,
                "version_history_depth": 20, "team_members": 2},
    ),
    "pro": Plan(
        id="pro", name="Pro", monthly_credits=10000,
        access={"content_agent": True, "publishing": True, "publishing_calendar": True,
                "ai_influencer": True, "live_publishing": True, "video_generation": True,
                "real_provider_access": True, "advanced_content_types": True, "byok": True,
                "premium_video_models": True, "higher_resolution": True, "priority_processing": True},
        limits={"monthly_text_generations": UNLIMITED, "monthly_video_generations": 100, "max_documents": UNLIMITED,
                "max_variations": 5, "connected_accounts": 10, "scheduled_jobs": UNLIMITED,
                "active_influencer_profiles": 5, "concurrent_provider_jobs": 5,
                "version_history_depth": UNLIMITED, "team_members": 10},
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
