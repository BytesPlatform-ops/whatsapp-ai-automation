"""Marketing Brain — the single source of marketing intelligence for a tenant.

Aggregates everything Pixie already knows about a connected Meta account — the
diagnostics, ad accounts / campaigns / insights, Facebook Page + Instagram assets,
the Brand Brain (learned from old posts), saved ideas, the content calendar, and
the inbox — and turns it into PERSONALIZED, actionable recommendations plus an
enriched brand view.

Design principle: **AI-with-fallback, never blank**. `analyze()` gathers all
available signals (business profile, posts, campaigns, insights, inbox, ideas,
calendar), builds a rich Brand Brain via the AI strategist (`marketing_ai`, which
falls back to deterministic reasoning when no provider is configured or it fails),
and turns it into personalized recommendations. It never errors just because data
or a provider is missing. Results are stored in pixie_kv.

Guardrails preserved: nothing here creates a campaign or publishes anything. Drafts
attached to recommendations are proposals only; acting on one routes the user into
the PAUSED-only / approval-gated flows that already exist.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from . import ads
from . import brand_brain
from . import business_profile
from . import calendar as content_calendar
from . import diagnostics
from . import idea_curator
from . import marketing_ai
from .kv_store import KVDict, KVList
from .store import get_meta_store

_RECS = KVList("meta_marketing_recs")
_STATE = KVDict("meta_analysis_state")

_PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}
_MAX_RECS = 9


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rid(slug: str) -> str:
    return f"rec_{slug}_" + secrets.token_hex(3)


# ── State gathering (robust — a failing source never breaks analyze) ───────────

def _safe(fn, default):
    try:
        return fn()
    except Exception:
        return default


def gather_state(tenant_id: str) -> dict:
    store = get_meta_store()
    mode = store.mode(tenant_id)
    assets = _safe(lambda: store.get_assets(tenant_id), {})
    defaults = _safe(lambda: store.defaults(tenant_id), {})

    pages = assets.get("facebook_pages", []) or []
    igs = assets.get("instagram_accounts", []) or []
    ad_accts_res = _safe(lambda: ads.list_ad_accounts(tenant_id), {}) if mode else {}
    ad_accounts = ad_accts_res.get("ad_accounts", []) or []
    ad_id = defaults.get("ad_account_id") or (ad_accounts[0]["id"] if ad_accounts else "")

    campaigns_res = _safe(lambda: ads.list_campaigns(tenant_id, ad_id), {}) if ad_id else {}
    campaigns = campaigns_res.get("campaigns", []) or []
    insights_res = _safe(lambda: ads.ad_insights(tenant_id, ad_id), {}) if ad_id else {}
    insights = insights_res.get("insights", {}) or {}

    # The persisted (LLM) Brand Brain supplies qualitative fields when it exists;
    # posts + stats are fetched fresh & deterministically here (no model) so the
    # Command Center is post-aware even before the AI Brand Brain is built.
    brain = _safe(lambda: brand_brain.get_brand_brain(tenant_id), {"exists": False})
    analyzed = brain.get("analyzed", {}) if brain.get("exists") else {}
    # Only read posts for a connected account (fetch_recent_content returns demo
    # posts for any non-live mode, which would wrongly inflate an unconnected one).
    posts = _safe(lambda: brand_brain.fetch_recent_content(tenant_id)[0], []) if mode else []
    stats = _safe(lambda: brand_brain._compute_stats(posts), {})
    post_count = len(posts)

    ideas = _safe(lambda: idea_curator.list_ideas(tenant_id).get("ideas", []), [])
    cal = _safe(lambda: content_calendar.get_calendar(tenant_id).get("items", []), [])

    inbox_items = _safe(lambda: _inbox_counts(tenant_id), {"comments": 0, "dms": 0, "unhandled": 0})
    perms = _safe(lambda: diagnostics.run_diagnostics(tenant_id), {})
    missing_perms = perms.get("missing_permissions", []) if isinstance(perms, dict) else []
    pending_approvals = _safe(lambda: _pending_approvals(tenant_id), 0)

    spend = float(insights.get("spend") or 0)
    ctr = float(insights.get("ctr") or 0)

    profile = _safe(lambda: business_profile.get_profile(tenant_id), {})
    inbox_themes = _safe(lambda: _inbox_themes(tenant_id), [])

    return {
        "connected": mode is not None,
        "mode": mode,
        "demo": mode == "demo",
        "profile_context": profile.get("answers", {}),
        "profile_completion": profile.get("completion", 0.0),
        "profile_answered": profile.get("answered", 0),
        "profile_total": profile.get("total", 0),
        "profile_complete": profile.get("complete", False),
        "profile_missing": profile.get("missing", []),
        "inbox_themes": inbox_themes,
        "has_page": len(pages) > 0,
        "has_instagram": len(igs) > 0,
        "ad_account_count": len(ad_accounts),
        "ad_account_id": ad_id,
        "campaign_count": len(campaigns),
        "campaigns": campaigns,
        "insights": insights,
        "has_spend": spend > 0,
        "ctr": ctr,
        "post_count": post_count,
        "brand_exists": bool(brain.get("exists")),
        "brand_ai": bool(brain.get("ai_generated")),
        "analyzed": analyzed,
        "stats": stats,
        "ideas_count": len(ideas),
        "calendar_count": len(cal),
        "calendar_drafts": sum(1 for c in cal if c.get("status") == "draft"),
        "inbox": inbox_items,
        "missing_permissions": missing_perms,
        "pending_approvals": pending_approvals,
    }


def _inbox_counts(tenant_id: str) -> dict:
    from . import inbox
    items = inbox.list_inbox(tenant_id)
    comments = sum(1 for i in items if getattr(i, "interaction_type", "") == "comment")
    dms = sum(1 for i in items if getattr(i, "interaction_type", "") == "dm")
    unhandled = sum(1 for i in items if getattr(i, "status", "new") in ("new", "pending", ""))
    return {"comments": comments, "dms": dms, "unhandled": unhandled}


def _inbox_themes(tenant_id: str) -> list[str]:
    """Recent customer messages as raw signal for the strategist. Group B turns
    these into structured inbox intelligence (intent/objections/FAQ)."""
    from . import inbox
    out = []
    for i in inbox.list_inbox(tenant_id)[:8]:
        text = getattr(i, "text", None) or getattr(i, "message", None) or getattr(i, "content", None)
        if text:
            out.append(str(text)[:160])
    return out


def _pending_approvals(tenant_id: str) -> int:
    from approvals.router import get_approvals_store
    return sum(1 for a in get_approvals_store().list(tenant_id)
               if a.agent == "marketing-agent" and a.status in ("pending", "approved"))


# ── Enriched brand view (adds marketing angles + data warnings) ────────────────

def _first(seq, default=""):
    return seq[0] if seq else default


def build_brand_view(state: dict) -> dict:
    a = state.get("analyzed", {}) or {}
    services = a.get("services") or []
    topics = a.get("best_topics") or a.get("content_pillars") or []
    if not state["brand_exists"]:
        data_source = "starter / limited data"
    elif not state["brand_ai"]:
        data_source = "limited data"
    else:
        data_source = "ai" if state["post_count"] else "starter / limited data"

    svc = _first(services, "your core service")
    topic = _first(topics, "your best work")

    ad_angles = [f"Lead with the outcome of {s}, not the feature" for s in services[:2]] or \
        [f"Lead with the outcome of {svc}"]
    retargeting_angles = [f"Re-engage people who viewed {svc} but didn't book",
                          "Offer a small first-time incentive to warm leads"]
    local_awareness_angles = [f"Target within ~5km for {svc}",
                              f"Highlight “{topic}” to nearby customers"]

    warnings = []
    if not state["has_instagram"]:
        warnings.append("No Instagram Business account linked — you're missing IG reach.")
    if state["ad_account_count"] == 0:
        warnings.append("No ad account connected — ads insights and campaigns are unavailable.")
    if state["campaign_count"] == 0:
        warnings.append("No campaigns yet — nothing is running.")
    if not state["has_spend"]:
        warnings.append("No ad spend/performance data yet — recommendations use content signals.")
    if state["post_count"] < 5:
        warnings.append("Few historical posts to learn from — brand profile is a starter estimate.")
    if state["missing_permissions"]:
        warnings.append("Some Meta permissions aren't granted yet (needs reconnect / App Review).")

    return {
        "data_source": data_source,
        "generated_at": _now(),
        "brand_summary": a.get("brand_tone") or "A local business Pixie is learning about from your Meta activity.",
        "audience": a.get("audience") or "Your local customers — refine this as more data connects.",
        "tone": a.get("brand_tone") or "Friendly and clear.",
        "services": services,
        "content_pillars": a.get("content_pillars") or [],
        "strongest_themes": topics,
        "weak_patterns": a.get("weak_topics") or [],
        "recommended_cta": a.get("cta_style") or "A light, question-led CTA that invites replies.",
        "posting_suggestions": a.get("posting_suggestions") or [
            "Post consistently 3–4×/week.", "Lead with Reels for reach.",
        ],
        "ad_angles": ad_angles,
        "retargeting_angles": retargeting_angles,
        "local_awareness_angles": local_awareness_angles,
        "missing_data_warnings": warnings,
        "stats": state.get("stats", {}),
    }


# ── Recommendation engine (deterministic personalization rules) ────────────────

def _rec(slug, title, category, priority, reason, source, confidence, action, target_tab, draft=None):
    r = {"id": _rid(slug), "title": title, "category": category, "priority": priority,
         "reason": reason, "source": source, "confidence": confidence,
         "suggested_action": action.replace("_", " ").title(), "action": action,
         "target_tab": target_tab, "status": "new"}
    if draft:
        r["draft"] = draft
    return r


def _onboarding_rec(state: dict) -> dict:
    answered, total = state.get("profile_answered", 0), state.get("profile_total", 12)
    return _rec(
        "profile", f"Tell Pixie about your business ({answered}/{total})", "action",
        "high" if answered == 0 else "medium",
        "Answer a few quick questions so Pixie can write sharper, on-brand campaigns, content and "
        "ads for YOUR business — not generic advice.",
        "manual_business_context", 0.82, "open_onboarding", "overview")


def build_recommendations(state: dict, brand: dict) -> list[dict]:
    recs: list[dict] = []

    if not state["connected"]:
        recs.append(_rec(
            "connect", "Connect your Meta account", "action", "high",
            "Pixie can analyze your Facebook Page, Instagram, ad accounts, campaigns and posts once "
            "connected — then generate a real plan for your business.",
            "no_data_setup", 0.9, "connect", "overview"))
        if state.get("profile_completion", 0) < 1.0:
            recs.append(_onboarding_rec(state))
        # Even before connecting, Pixie can suggest a starter direction from the profile/brand.
        recs.append(_rec(
            "starter_strategy", "Get a starter content plan", "content", "medium",
            "Pixie can draft a starter content calendar and ideas from your business profile while "
            "you connect Meta — nothing publishes automatically.", "manual_business_context", 0.6,
            "generate_calendar", "calendar"))
        return recs

    topics = brand.get("strongest_themes") or brand.get("content_pillars") or []

    # Ask for business context first — it sharpens everything below.
    if state.get("profile_completion", 0) < 1.0:
        recs.append(_onboarding_rec(state))

    # Diagnostics-driven setup recs
    if state["has_page"] and not state["has_instagram"]:
        recs.append(_rec(
            "link_ig", "Link your Instagram Business account", "action", "medium",
            "Your Facebook Page is connected but no Instagram Business account is linked — you're "
            "missing Instagram reach and content publishing.", "no_data_setup", 0.8,
            "link_instagram", "overview"))
    if state["ad_account_count"] == 0:
        recs.append(_rec(
            "no_ad_account", "Add an ad account", "ads", "medium",
            "No ad account is available. Add or request access to your ad account in Meta Business "
            "Suite so Pixie can read performance and prepare campaigns.", "no_data_setup", 0.75,
            "open_diagnostics", "overview"))

    # Campaign recs
    if state["ad_account_count"] > 0 and state["campaign_count"] == 0:
        recs.append(_rec(
            "first_campaign", "Create your first paused awareness campaign", "campaign", "high",
            "No campaigns found. Pixie prepared a PAUSED local-awareness draft you can review — "
            "nothing goes live automatically; you activate it in Meta Ads Manager when ready.",
            "ads_insights", 0.78, "review_campaign", "ads",
            draft={"campaign_name": "Local Awareness — Starter", "objective": "OUTCOME_AWARENESS",
                   "status": "PAUSED", "angle": brand.get("local_awareness_angles", ["Introduce your business locally"])[0]}))
    elif state["campaign_count"] > 0 and not state["has_spend"]:
        recs.append(_rec(
            "no_spend", "No spend yet — start a small test", "ads", "medium",
            "You have campaigns but no delivery/spend in this window. Pixie can prepare a small "
            "paused test campaign to learn what works before you scale.", "ads_insights", 0.7,
            "review_campaign", "ads",
            draft={"campaign_name": "Traffic Test — Starter", "objective": "OUTCOME_TRAFFIC",
                   "status": "PAUSED", "angle": brand.get("ad_angles", ["Lead with your best offer"])[0]}))
    elif state["has_spend"] and state["ctr"] and state["ctr"] < 1.0:
        recs.append(_rec(
            "low_ctr", "Refresh your ad creative", "ads", "high",
            f"Account CTR is {state['ctr']:.2f}% (under 1%). The creative or audience may not be "
            "landing — test a stronger hook or tighter targeting.", "ads_insights", 0.72,
            "analyze", "ads"))

    # Content recs
    if state["has_instagram"] and state["post_count"] == 0:
        recs.append(_rec(
            "starter_calendar", "Generate a 7-day starter content calendar", "content", "high",
            "No recent content found on your account. Pixie can draft a 7-day starter calendar to get "
            "you posting consistently.", "instagram_content", 0.76, "generate_calendar", "calendar"))
    if state["post_count"] > 0 and topics:
        recs.append(_rec(
            "topic_ideas", f"Turn “{topics[0]}” into new posts", "content", "medium",
            f"“{topics[0]}” is one of your strongest themes. Pixie can spin it into fresh carousel and "
            "reel ideas that match your voice.", "old_posts", 0.74, "view_ideas", "ideas"))
    if state["calendar_drafts"] > 0:
        recs.append(_rec(
            "review_plan", f"Review your content plan ({state['calendar_drafts']} drafts)", "content", "medium",
            "You have draft calendar items waiting. Review, approve, and schedule them.", "page_content",
            0.7, "view_plan", "calendar"))
    elif state["calendar_count"] == 0 and state["post_count"] > 0:
        recs.append(_rec(
            "make_calendar", "Plan this week's content", "content", "medium",
            "Pixie can draft a 7-day plan tuned to your best topics so you post consistently without "
            "manual planning.", "old_posts", 0.7, "generate_calendar", "calendar"))
    if state["ideas_count"] > 0 and state["calendar_drafts"] == 0:
        recs.append(_rec(
            "schedule_ideas", f"Schedule your {state['ideas_count']} saved ideas", "content", "low",
            "You've saved ideas in your library — turn them into a dated plan.", "manual_business_context",
            0.65, "view_plan", "calendar"))

    # Attention / retention
    if state["pending_approvals"] > 0:
        recs.append(_rec(
            "approvals", f"{state['pending_approvals']} item(s) awaiting approval", "action", "high",
            "Pixie has prepared work that needs your approval before anything happens.", "manual_business_context",
            0.85, "approve", "approvals"))
    unhandled = state["inbox"].get("unhandled", 0)
    if unhandled > 0:
        recs.append(_rec(
            "inbox", f"{unhandled} message(s) need a reply", "retention", "medium",
            "You have unanswered comments or DMs. Fast replies keep customers engaged.", "page_content",
            0.7, "view_inbox", "inbox"))
    if state["missing_permissions"]:
        recs.append(_rec(
            "permissions", "Limited Meta access — approve permissions", "action", "low",
            "Some capabilities (comments / DMs / ads) aren't granted yet. Reconnect and approve them "
            "(some need Meta App Review) to unlock the full experience.", "no_data_setup", 0.6,
            "open_diagnostics", "overview"))

    recs.sort(key=lambda r: (_PRIORITY_RANK.get(r["priority"], 3), -r["confidence"]))
    return recs[:_MAX_RECS]


# ── Public API ────────────────────────────────────────────────────────────────

def _brain_context(state: dict) -> dict:
    stats = state.get("stats", {}) or {}
    return {
        "profile": state.get("profile_context", {}),
        "profile_missing": state.get("profile_missing", []),
        "post_count": state.get("post_count", 0),
        "top_posts": stats.get("top_posts", []),
        "weak_posts": stats.get("weak_posts", []),
        "post_types": stats.get("post_types", {}),
        "stats": stats,
        "campaigns": [{"name": c.get("name"), "status": c.get("status"), "objective": c.get("objective")}
                      for c in state.get("campaigns", [])],
        "insights": state.get("insights", {}),
        "has_spend": state.get("has_spend"),
        "inbox_themes": state.get("inbox_themes", []),
        "has_page": state.get("has_page"),
        "has_instagram": state.get("has_instagram"),
    }


async def analyze(tenant_id: str) -> dict:
    """Gather all signals → rich Brand Brain (AI with deterministic fallback) →
    personalized recommendations. Never blanks or errors on missing data/provider.
    Persists results to pixie_kv."""
    state = gather_state(tenant_id)
    brand = await marketing_ai.generate_brand_brain(tenant_id, _brain_context(state))
    recs = build_recommendations(state, brand)
    _RECS.replace(tenant_id, recs)

    data_source_summary = {
        "connected": state["connected"], "mode": state["mode"],
        "ad_accounts": state["ad_account_count"], "campaigns": state["campaign_count"],
        "has_spend": state["has_spend"], "posts": state["post_count"],
        "has_page": state["has_page"], "has_instagram": state["has_instagram"],
        "ideas": state["ideas_count"], "calendar_items": state["calendar_count"],
        "pending_approvals": state["pending_approvals"],
        "missing_permissions": state["missing_permissions"],
        "profile_completion": state["profile_completion"],
        "profile_complete": state["profile_complete"],
    }
    summary = _summary_line(state)
    analysis_state = {
        "last_analyzed": _now(), "connected": state["connected"], "mode": state["mode"],
        "summary": summary, "data_source_summary": data_source_summary,
        "recommendation_count": len(recs), "brand_data_source": brand.get("data_source"),
        "brand_provider": brand.get("provider"), "profile_completion": state["profile_completion"],
    }
    _STATE.set(tenant_id, analysis_state)

    return {"status": "analyzed", "summary": summary, "connected": state["connected"],
            "mode": state["mode"], "recommendations": recs, "brand": brand,
            "analysis_state": analysis_state}


def _summary_line(state: dict) -> str:
    if not state["connected"]:
        base = "Connect Meta so Pixie can analyze your account — meanwhile answer a few questions and Pixie builds a starter plan."
    else:
        bits = [f"{state['campaign_count']} campaign(s)",
                "with spend" if state["has_spend"] else "no spend yet",
                f"{state['post_count']} recent post(s)"]
        if state["has_instagram"]:
            bits.append("IG linked")
        base = "Analyzed your Meta account: " + ", ".join(bits) + "."
    if not state.get("profile_complete", False):
        base += f" Business profile {int(state.get('profile_completion', 0) * 100)}% complete."
    return base


def get_brain(tenant_id: str) -> dict:
    """The rich Brand Brain (stored) or a deterministic enriched view if none yet."""
    stored = marketing_ai.get_brand_brain(tenant_id)
    if stored:
        return stored
    return build_brand_view(gather_state(tenant_id))


def get_recommendations(tenant_id: str) -> dict:
    return {"recommendations": _RECS.list(tenant_id)}


def get_analysis_state(tenant_id: str) -> dict:
    return _STATE.get(tenant_id) or {"last_analyzed": None, "connected": None}


def set_recommendation_status(tenant_id: str, rec_id: str, status: str) -> dict:
    updated = _RECS.update(tenant_id, rec_id, {"status": status})
    if not updated:
        return {"status": "not_found", "id": rec_id}
    return {"status": "ok", "recommendation": updated}
