"""Publishing adapters.

* ``DryRunAdapter`` — never makes an HTTP call; returns a clearly-simulated post
  id. Used whenever a job's mode is ``dry_run`` (the default) or the platform is
  not live-capable.
* ``MetaPublishAdapter`` — real Facebook Page + Instagram publishing against the
  Graph API. HTTP is done through an INJECTABLE ``transport`` so tests exercise
  the full flow against mocked Graph contracts without ever calling Meta. Graph
  errors are mapped to safe categories; tokens never appear in results or logs.

The factory ``get_adapter`` picks the adapter from (platform, mode). Live mode is
only reachable when the caller has already confirmed live is enabled + authorized.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from typing import Callable, Optional, Tuple

from content_agent.errors import ErrorCategory, new_correlation_id

from .enums import ContentFormat, Platform, PublishMode

GRAPH_VERSION = "v19.0"
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_VERSION}"

# Graph error code → safe category. Retryable only for transient conditions.
_GRAPH_CODE_CATEGORY = {
    190: ErrorCategory.INVALID_CREDENTIALS,   # token expired/invalid → reconnection
    102: ErrorCategory.INVALID_CREDENTIALS,
    10: ErrorCategory.PERMISSION_DENIED,
    200: ErrorCategory.PERMISSION_DENIED,
    3: ErrorCategory.PERMISSION_DENIED,
    4: ErrorCategory.RATE_LIMITED,
    17: ErrorCategory.RATE_LIMITED,
    32: ErrorCategory.RATE_LIMITED,
    613: ErrorCategory.RATE_LIMITED,
    100: ErrorCategory.INVALID_REQUEST,
    9004: ErrorCategory.UNSUPPORTED_MEDIA,
    2207026: ErrorCategory.UNSUPPORTED_MEDIA,
    1: ErrorCategory.TEMPORARY_PROVIDER_FAILURE,
    2: ErrorCategory.TEMPORARY_PROVIDER_FAILURE,
}
_RETRYABLE = {ErrorCategory.RATE_LIMITED, ErrorCategory.TEMPORARY_PROVIDER_FAILURE,
              ErrorCategory.PROVIDER_TIMEOUT, ErrorCategory.JOB_FAILED}


@dataclass
class PublishOutcome:
    ok: bool
    platform_post_id: str = ""
    permalink: str = ""
    platform_request_id: str = ""
    response_meta: dict = field(default_factory=dict)  # safe metadata only
    error_category: str = ""
    retryable: bool = False
    error_correlation_id: str = ""
    reconnection_required: bool = False


# transport(method, url, params) -> (status_code, json_dict)
Transport = Callable[[str, str, dict], Tuple[int, dict]]


class PublishAdapter:
    name = ""

    def publish(self, job: dict, *, token: Optional[str]) -> PublishOutcome:
        raise NotImplementedError


class DryRunAdapter(PublishAdapter):
    """Runs all worker logic but NEVER calls a platform. Returns a simulated id."""
    name = "dry_run"

    def publish(self, job: dict, *, token: Optional[str]) -> PublishOutcome:
        sim = "dryrun_" + secrets.token_hex(8)
        return PublishOutcome(
            ok=True,
            platform_post_id=sim,
            permalink="",
            platform_request_id="",
            response_meta={"simulated": True, "note": "Dry run — nothing was posted live."},
        )


def _map_graph_error(status: int, body: dict) -> PublishOutcome:
    err = (body or {}).get("error", {}) if isinstance(body, dict) else {}
    code = err.get("code")
    category = _GRAPH_CODE_CATEGORY.get(code)
    if category is None:
        category = ErrorCategory.TEMPORARY_PROVIDER_FAILURE if status >= 500 else ErrorCategory.UNKNOWN
    return PublishOutcome(
        ok=False,
        error_category=category.value,
        retryable=category in _RETRYABLE,
        reconnection_required=category is ErrorCategory.INVALID_CREDENTIALS,
        error_correlation_id=new_correlation_id(),
        platform_request_id=str(err.get("fbtrace_id", "")),  # safe trace id, not a secret
        response_meta={"graph_code": code, "graph_type": err.get("type", "")},  # NO message (may echo input)
    )


def _default_transport(method: str, url: str, params: dict) -> Tuple[int, dict]:
    import httpx  # local import; only used in real live mode
    with httpx.Client(timeout=30) as http:
        r = http.request(method, url, data=params)
        try:
            return r.status_code, r.json()
        except ValueError:
            return r.status_code, {}


class MetaPublishAdapter(PublishAdapter):
    """Real Facebook Page + Instagram Graph publishing (mock-transport testable)."""
    name = "meta"

    def __init__(self, platform: Platform, *, transport: Optional[Transport] = None, max_polls: int = 10) -> None:
        self.platform = platform
        self._t = transport or _default_transport
        self._max_polls = max_polls

    def _post(self, path: str, token: str, **params) -> Tuple[int, dict]:
        params["access_token"] = token
        return self._t("POST", f"{GRAPH_BASE}/{path}", params)

    def _get(self, path: str, token: str, **params) -> Tuple[int, dict]:
        params["access_token"] = token
        return self._t("GET", f"{GRAPH_BASE}/{path}", params)

    def publish(self, job: dict, *, token: Optional[str]) -> PublishOutcome:
        if not token:
            return PublishOutcome(ok=False, error_category=ErrorCategory.INVALID_CREDENTIALS.value,
                                  reconnection_required=True, error_correlation_id=new_correlation_id())
        if self.platform is Platform.FACEBOOK:
            return self._publish_facebook(job, token)
        if self.platform is Platform.INSTAGRAM:
            return self._publish_instagram(job, token)
        return PublishOutcome(ok=False, error_category=ErrorCategory.UNSUPPORTED_MODEL.value,
                              error_correlation_id=new_correlation_id())

    # ── Facebook Page ─────────────────────────────────────────────────────────
    def _publish_facebook(self, job: dict, token: str) -> PublishOutcome:
        account = job.get("account_id", "")
        snap = job.get("snapshot", {})
        fmt = snap.get("content_format")
        text = snap.get("text", "")
        link = snap.get("link", "")
        media = snap.get("media_asset_ids", [])
        media_urls = job.get("_media_urls", [])  # resolved public URLs (set by the service)

        if fmt in (ContentFormat.IMAGE.value,) and media_urls:
            status, body = self._post(f"{account}/photos", token, url=media_urls[0], caption=text)
        elif fmt in (ContentFormat.VIDEO.value, ContentFormat.REEL.value) and media_urls:
            status, body = self._post(f"{account}/videos", token, file_url=media_urls[0], description=text)
        else:  # text / link
            params = {"message": text}
            if link:
                params["link"] = link
            status, body = self._post(f"{account}/feed", token, **params)

        if status >= 300 or "error" in (body or {}):
            return _map_graph_error(status, body)
        post_id = body.get("id") or body.get("post_id") or ""
        return PublishOutcome(ok=True, platform_post_id=str(post_id),
                              permalink=f"https://www.facebook.com/{post_id}" if post_id else "",
                              response_meta={"simulated": False})

    # ── Instagram (container workflow) ─────────────────────────────────────────
    def _publish_instagram(self, job: dict, token: str) -> PublishOutcome:
        account = job.get("account_id", "")
        snap = job.get("snapshot", {})
        fmt = snap.get("content_format")
        caption = snap.get("text", "")
        media_urls = job.get("_media_urls", [])
        if not media_urls:
            return PublishOutcome(ok=False, error_category=ErrorCategory.UNSUPPORTED_MEDIA.value,
                                  error_correlation_id=new_correlation_id())

        # 1) create container
        if fmt in (ContentFormat.VIDEO.value, ContentFormat.REEL.value):
            status, body = self._post(f"{account}/media", token, media_type="REELS", video_url=media_urls[0], caption=caption)
        else:
            status, body = self._post(f"{account}/media", token, image_url=media_urls[0], caption=caption)
        if status >= 300 or "error" in (body or {}):
            return _map_graph_error(status, body)
        creation_id = body.get("id", "")
        if not creation_id:
            return PublishOutcome(ok=False, error_category=ErrorCategory.MALFORMED_OUTPUT.value,
                                  error_correlation_id=new_correlation_id())

        # 2) poll container status (bounded)
        for _ in range(self._max_polls):
            s, st = self._get(creation_id, token, fields="status_code")
            if s >= 300 or "error" in (st or {}):
                return _map_graph_error(s, st)
            code = (st or {}).get("status_code", "")
            if code == "FINISHED":
                break
            if code in ("ERROR", "EXPIRED"):
                cat = ErrorCategory.JOB_EXPIRED if code == "EXPIRED" else ErrorCategory.JOB_FAILED
                return PublishOutcome(ok=False, error_category=cat.value, retryable=(code != "EXPIRED"),
                                      error_correlation_id=new_correlation_id())
        else:
            return PublishOutcome(ok=False, error_category=ErrorCategory.PROVIDER_TIMEOUT.value,
                                  retryable=True, error_correlation_id=new_correlation_id())

        # 3) publish container
        ps, pb = self._post(f"{account}/media_publish", token, creation_id=creation_id)
        if ps >= 300 or "error" in (pb or {}):
            return _map_graph_error(ps, pb)
        media_id = pb.get("id", "")

        # 4) permalink (best-effort)
        permalink = ""
        ls, lb = self._get(str(media_id), token, fields="permalink")
        if ls < 300 and isinstance(lb, dict):
            permalink = lb.get("permalink", "")
        return PublishOutcome(ok=True, platform_post_id=str(media_id), permalink=permalink,
                              response_meta={"simulated": False, "creation_id": creation_id})


def get_adapter(platform: Platform, mode: PublishMode, *, transport: Optional[Transport] = None) -> PublishAdapter:
    if mode is PublishMode.DRY_RUN:
        return DryRunAdapter()
    return MetaPublishAdapter(platform, transport=transport)
