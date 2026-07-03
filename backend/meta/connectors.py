"""Meta connectors — mock (safe) + REAL Graph publish/reply.

Mock connectors clearly label that nothing went live. Real connectors call the
Graph API with the page/IG token stored in the bound connection; they NEVER fake
success — a permission or API error is returned as an error result. Real
publishing requires Meta App Review of the relevant scopes, so until the app is
reviewed these calls will return a permission error, honestly surfaced.

Sync (httpx.Client) — runs inside the sync approvals executor (threadpool).
"""

from __future__ import annotations

import itertools

import httpx

from . import oauth as m

_seq = itertools.count(1)


def _mid(prefix: str) -> str:
    return f"{prefix}_{next(_seq)}"


# ── Mock connectors ───────────────────────────────────────────────────────────

def mock_meta_publish(payload: dict) -> dict:
    return {
        "status": "success", "provider": "mock_meta",
        "message": f"Mock {payload.get('platform', 'meta')} {payload.get('media_type', 'post')} "
                   "published. Nothing went live.",
        "mock_post_id": _mid("mock_post"),
        "platform": payload.get("platform"), "asset_id": payload.get("asset_id"),
        "caption": payload.get("caption"),
    }


def mock_meta_reply(payload: dict) -> dict:
    return {
        "status": "success", "provider": "mock_meta",
        "message": "Mock reply posted. Nothing went live.",
        "mock_reply_id": _mid("mock_reply"),
        "target_id": payload.get("target_id"), "text": payload.get("text"),
    }


# ── Real Graph connectors ─────────────────────────────────────────────────────

def _page_for(connection: dict, asset_id: str, *, by_instagram: bool = False):
    for p in connection.get("pages", []):
        if by_instagram:
            ig = p.get("linked_instagram") or {}
            if ig.get("id") == asset_id:
                return p
        elif p.get("id") == asset_id:
            return p
    return None


def real_meta_publish(payload: dict, connection: dict) -> dict:
    platform = payload.get("platform")
    asset_id = payload.get("asset_id")
    caption = payload.get("caption", "")
    media_url = payload.get("media_url")
    try:
        if platform == "instagram":
            page = _page_for(connection, asset_id, by_instagram=True)
            if not page:
                return {"status": "error", "provider": "meta_instagram", "error": "missing_asset",
                        "message": f"No connected page links Instagram {asset_id}."}
            if not media_url:
                return {"status": "error", "provider": "meta_instagram", "error": "no_media",
                        "message": "Instagram publishing requires a public media URL."}
            token = page.get("page_access_token")
            media_type = payload.get("media_type", "IMAGE")
            container_body = {"caption": caption, "access_token": token}
            if media_type in ("REELS", "VIDEO"):
                container_body["media_type"] = "REELS" if media_type == "REELS" else "VIDEO"
                container_body["video_url"] = media_url
            else:
                container_body["image_url"] = media_url
            with httpx.Client(timeout=30) as http:
                c = http.post(f"{m.graph_base()}/{asset_id}/media", data=container_body)
                if c.status_code >= 300:
                    return {"status": "error", "provider": "meta_instagram", "error": "api_error",
                            "http_status": c.status_code, "message": c.text[:400]}
                creation_id = c.json().get("id")
                pub = http.post(f"{m.graph_base()}/{asset_id}/media_publish",
                                data={"creation_id": creation_id, "access_token": token})
                if pub.status_code >= 300:
                    return {"status": "error", "provider": "meta_instagram", "error": "publish_error",
                            "http_status": pub.status_code, "message": pub.text[:400]}
                return {"status": "success", "provider": "meta_instagram",
                        "message": "Real Instagram media published.",
                        "post_id": pub.json().get("id")}
        elif platform == "facebook":
            page = _page_for(connection, asset_id)
            if not page:
                return {"status": "error", "provider": "meta_pages", "error": "missing_asset",
                        "message": f"Page {asset_id} is not connected."}
            token = page.get("page_access_token")
            with httpx.Client(timeout=30) as http:
                if media_url:
                    r = http.post(f"{m.graph_base()}/{asset_id}/photos",
                                  data={"url": media_url, "caption": caption, "access_token": token})
                else:
                    r = http.post(f"{m.graph_base()}/{asset_id}/feed",
                                  data={"message": caption, "access_token": token})
                if r.status_code >= 300:
                    return {"status": "error", "provider": "meta_pages", "error": "api_error",
                            "http_status": r.status_code, "message": r.text[:400]}
                return {"status": "success", "provider": "meta_pages",
                        "message": "Real Facebook Page post published.",
                        "post_id": r.json().get("id") or r.json().get("post_id")}
        return {"status": "error", "provider": "meta", "error": "unsupported_platform",
                "message": f"Unsupported platform: {platform}"}
    except Exception as exc:
        return {"status": "error", "provider": "meta", "error": "exception", "message": str(exc)}


def real_meta_comment_reply(payload: dict, connection: dict) -> dict:
    target_id = payload.get("target_id")
    text = payload.get("text", "")
    page = None
    if connection.get("pages"):
        page = connection["pages"][0]
    if not page:
        return {"status": "error", "provider": "meta", "error": "missing_asset",
                "message": "No connected page for comment reply."}
    try:
        with httpx.Client(timeout=20) as http:
            r = http.post(f"{m.graph_base()}/{target_id}/comments",
                          data={"message": text, "access_token": page.get("page_access_token")})
            if r.status_code >= 300:
                return {"status": "error", "provider": "meta", "error": "api_error",
                        "http_status": r.status_code, "message": r.text[:400]}
            return {"status": "success", "provider": "meta",
                    "message": "Real reply posted.", "reply_id": r.json().get("id")}
    except Exception as exc:
        return {"status": "error", "provider": "meta", "error": "exception", "message": str(exc)}
