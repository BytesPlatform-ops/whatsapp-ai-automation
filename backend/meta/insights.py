"""Meta analytics — organic + ads summary for a connected asset.

Demo mode returns seeded data (source="demo"). Live mode does a best-effort real
Graph fetch and, on any failure, returns a PARTIAL result with the error — it does
NOT silently fall back to demo numbers (that would be faking real data). Metric
availability changes over time, so the real path degrades gracefully rather than
hardcoding deprecated metrics.
"""

from __future__ import annotations

import httpx

from integrations import connections

from . import oauth as m
from . import seed
from .store import get_meta_store


def analytics_summary(tenant_id: str, asset_id: str = "", date_range: str = "last_30_days") -> dict:
    store = get_meta_store()
    mode = store.mode(tenant_id)
    defaults = store.defaults(tenant_id)
    asset_id = asset_id or defaults.get("instagram_id") or defaults.get("page_id") or ""

    if mode != "live":
        summary = seed.demo_analytics_summary(asset_id or "ig_demo_1", date_range)
        return {"source": "demo", "summary": summary,
                "note": "Seeded demo analytics — connect a real Meta account for live numbers."}

    connection = connections.find_active_connection(tenant_id, "meta_page_insights_read")
    real = _real_summary(connection or {}, asset_id, date_range)
    return real


def _real_summary(connection: dict, asset_id: str, date_range: str) -> dict:
    """Best-effort live fetch. Returns partial + error rather than faking numbers."""
    page = None
    for p in connection.get("pages", []):
        ig = p.get("linked_instagram") or {}
        if p.get("id") == asset_id or ig.get("id") == asset_id:
            page = p
            break
    if not page:
        return {"source": "live", "partial": True, "error": "missing_asset",
                "message": f"Asset {asset_id} not found among connected pages."}
    token = page.get("page_access_token")
    ig_id = (page.get("linked_instagram") or {}).get("id")
    summary: dict = {"asset_id": asset_id, "date_range": date_range, "profile": {}, "top_posts": [],
                     "weak_posts": [], "best_times": [], "audience_notes": [], "ads_summary": {},
                     "recent_media": []}
    errors = []
    try:
        with httpx.Client(timeout=20) as http:
            if ig_id:
                prof = http.get(f"{m.graph_base()}/{ig_id}",
                                params={"fields": "followers_count,media_count,username",
                                        "access_token": token})
                if prof.status_code == 200:
                    d = prof.json()
                    summary["profile"] = {"followers": d.get("followers_count"),
                                          "media_count": d.get("media_count"),
                                          "username": d.get("username")}
                else:
                    errors.append(f"profile:{prof.status_code}")
                media = http.get(f"{m.graph_base()}/{ig_id}/media",
                                 params={"fields": "id,caption,media_type,permalink,like_count,comments_count",
                                         "limit": 10, "access_token": token})
                if media.status_code == 200:
                    summary["recent_media"] = media.json().get("data", [])
                else:
                    errors.append(f"media:{media.status_code}")
    except httpx.HTTPError as exc:
        errors.append(str(exc))
    out = {"source": "live", "summary": summary}
    if errors:
        out["partial"] = True
        out["errors"] = errors
        out["note"] = ("Partial live data — some Meta metrics were unavailable or require "
                       "App Review. Skipped metrics are omitted, not faked.")
    return out


def ads_insights(tenant_id: str, ad_account_id: str = "", date_range: str = "last_30_days") -> dict:
    """Read-only ads summary. Demo returns seeded ads_summary; live is read-only."""
    summary = analytics_summary(tenant_id, "", date_range)
    ads = (summary.get("summary") or {}).get("ads_summary", {})
    return {
        "source": summary.get("source"),
        "read_only": True,
        "ad_account_id": ad_account_id or get_meta_store().defaults(tenant_id).get("ad_account_id"),
        "date_range": date_range,
        "ads_summary": ads,
        "note": "Ads are READ-ONLY in this MVP — no campaign/budget changes.",
    }
