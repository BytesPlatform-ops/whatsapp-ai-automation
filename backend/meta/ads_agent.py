"""Ads Assistant — read-only intelligence over a tenant's Meta ad account.

Combines TWO layers so it is useful even with no OpenAI key:
  1. Deterministic signals computed from the real campaign list + account insights
     (weak / needs-attention / opportunity) — always present, never faked.
  2. An LLM pass that adds qualitative ad angles and *ideas* for new PAUSED
     campaigns. In fake mode the model returns nothing, so the signals still stand
     on their own; with PIXIE_MODEL_MODE=openai the suggestions are written for real.

HARD SAFETY: this module NEVER creates or changes a campaign. It only reads and
advises. Any "suggested campaign" is an idea the user must act on via the
PAUSED-only creator in ads.py — nothing here touches the Marketing API write path.
"""

from __future__ import annotations

import json

from activity.router import log_activity
from models import ModelRequest, get_router
from schemas import ModelTier

from . import ads
from .store import get_meta_store

AGENT_SLUG = "marketing-agent"

# CTR (%) below this on a spending account is worth a second look. Deliberately
# conservative — a heuristic prompt, not a verdict.
_LOW_CTR = 1.0
_HIGH_CPC = 2.0

ADS_ASSISTANT_PROMPT = """
You are Pixie Ads Assistant for a small business. You are given a Meta ad account's
campaigns and account-level insights (last period). Give practical, honest advice.

Rules:
- You are READ-ONLY. Never say you changed, launched, boosted, or paused anything.
- Any new campaign you propose is an IDEA ONLY and must be created PAUSED by the user.
- Be concrete and small-business friendly. No fluff.

Return JSON only, no markdown, exactly:
{
  "summary": "2-3 sentence read on the account",
  "suggested_angles": [
    {"angle": "short angle name", "rationale": "why it could work here"}
  ],
  "suggested_paused_campaigns": [
    {"name": "campaign name", "objective": "OUTCOME_TRAFFIC|OUTCOME_LEADS|OUTCOME_ENGAGEMENT|OUTCOME_AWARENESS|OUTCOME_SALES", "rationale": "why"}
  ]
}
""".strip()


def _signals(campaigns: list[dict], insights: dict) -> list[dict]:
    """Deterministic findings from the numbers we actually have. Account-level
    insights (not per-campaign) so signals stay at the account/status level."""
    out: list[dict] = []

    active = [c for c in campaigns if c.get("status") == "ACTIVE"]
    paused = [c for c in campaigns if "PAUSED" in (c.get("status") or "")]
    issues = [c for c in campaigns if c.get("effective_status") not in
              (c.get("status"), "ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", None, "")]

    if not campaigns:
        out.append({"type": "opportunity", "title": "No campaigns yet",
                    "detail": "This ad account has no campaigns. Start with one small PAUSED "
                              "test campaign and activate it in Ads Manager when you're ready."})
    if issues:
        names = ", ".join(c.get("name", "?") for c in issues[:3])
        out.append({"type": "attention", "title": "Campaigns with delivery issues",
                    "detail": f"{len(issues)} campaign(s) have a delivery/effective-status problem "
                              f"({names}). Check them in Ads Manager."})
    if active and paused:
        out.append({"type": "opportunity", "title": "Paused campaigns sitting idle",
                    "detail": f"{len(paused)} campaign(s) are paused while {len(active)} run. Review "
                              "the paused ones — refresh the creative or retire them."})

    spend = float(insights.get("spend") or 0)
    ctr = float(insights.get("ctr") or 0)
    cpc = float(insights.get("cpc") or 0)
    clicks = float(insights.get("clicks") or 0)
    if spend > 0 and ctr and ctr < _LOW_CTR:
        out.append({"type": "weak", "title": "Low click-through rate",
                    "detail": f"Account CTR is {ctr:.2f}% (under {_LOW_CTR:.0f}%). The creative or "
                              "audience may not be landing — test a stronger hook or tighter targeting."})
    if spend > 0 and cpc and cpc > _HIGH_CPC:
        out.append({"type": "weak", "title": "High cost per click",
                    "detail": f"Average CPC is {cpc:.2f}. Try broader placements or a more engaging "
                              "creative to bring it down."})
    if spend > 0 and clicks == 0:
        out.append({"type": "attention", "title": "Spend with no clicks",
                    "detail": "The account spent budget but recorded no clicks in this range — "
                              "worth pausing and reviewing targeting."})
    return out


async def _llm(campaigns: list[dict], insights: dict, tenant_id: str) -> tuple[dict, str, str]:
    router = get_router()
    user_msg = (
        "Campaigns:\n" + json.dumps(campaigns, ensure_ascii=False)[:3000] +
        "\n\nAccount insights:\n" + json.dumps(insights, ensure_ascii=False)[:1000] +
        "\n\nAnalyze and return the required JSON."
    )
    result = await router.complete(ModelRequest(
        tier=ModelTier.SMALL, task="marketing_ads", system=ADS_ASSISTANT_PROMPT,
        user=user_msg, expects_json=True,
        context={"tenant_id": tenant_id, "agent": AGENT_SLUG},
    ))
    try:
        data = json.loads(result.text) if result.text else {}
    except (ValueError, TypeError):
        data = {}
    provider = "openai" if router.mode == "openai" else "mock"
    return (data if isinstance(data, dict) else {}), provider, result.model


async def analyze_ads(tenant_id: str, ad_account_id: str = "", date_range: str = "last_30d") -> dict:
    """Read campaigns + insights and return signals + (optional) LLM suggestions.
    Never creates or changes a campaign."""
    if get_meta_store().mode(tenant_id) is None:
        return {"status": "not_connected",
                "message": "No Meta account connected. Connect Meta (or use demo data) first."}

    camp = ads.list_campaigns(tenant_id, ad_account_id)
    if camp.get("error"):
        return {"status": "error", **camp}
    ad_account_id = camp.get("ad_account_id", ad_account_id)
    campaigns = camp.get("campaigns", [])

    ins = ads.ad_insights(tenant_id, ad_account_id, date_range)
    insights = {} if ins.get("error") else ins.get("insights", {})
    insights_error = ins.get("message") if ins.get("error") else None

    signals = _signals(campaigns, insights)
    llm, provider, model_id = await _llm(campaigns, insights, tenant_id)

    log_activity(tenant_id, "meta_ads_analyzed", title="Pixie analyzed your ad account",
                 agent=AGENT_SLUG)

    return {
        "status": "analyzed",
        "source": camp.get("source"),
        "ad_account_id": ad_account_id,
        "date_range": date_range,
        "campaign_count": len(campaigns),
        "insights": insights,
        "insights_error": insights_error,
        "signals": signals,
        "summary": llm.get("summary", ""),
        "suggested_angles": llm.get("suggested_angles", []),
        "suggested_paused_campaigns": llm.get("suggested_paused_campaigns", []),
        "llm_provider": provider,
        "model": model_id,
        "note": "Suggestions are ideas only — nothing was created or changed. Use the PAUSED-only "
                "campaign creator to act on one.",
    }
