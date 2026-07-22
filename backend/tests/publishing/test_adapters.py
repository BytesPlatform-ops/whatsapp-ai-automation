"""Capabilities + Meta publishing adapter — mocked Graph contracts, NO live calls."""

from __future__ import annotations

import pytest

pytest.importorskip("pydantic")

from publishing.adapters import DryRunAdapter, MetaPublishAdapter, get_adapter
from publishing.capabilities import account_capabilities, platform_capabilities
from publishing.enums import ContentFormat, Platform, PublishMode


# ── capabilities ───────────────────────────────────────────────────────────────
def test_facebook_capabilities():
    caps = platform_capabilities(Platform.FACEBOOK)
    assert caps["text"] and caps["image"] and caps["video"] and caps["scheduling"]


def test_instagram_requires_media_no_text():
    caps = platform_capabilities(Platform.INSTAGRAM)
    assert caps["text"] is False and caps["image"] is True and caps["reel"] is True


def test_account_authorized_only_with_granted_scopes():
    ok = account_capabilities(Platform.FACEBOOK, ["pages_manage_posts", "pages_show_list"])
    assert ok["publishing_authorized"] is True and ok["missing_scopes"] == []
    missing = account_capabilities(Platform.FACEBOOK, ["pages_show_list"])
    assert missing["publishing_authorized"] is False
    assert "pages_manage_posts" in missing["missing_scopes"]
    assert missing["reconnection_required"] is True


def test_placeholder_platform_not_live():
    caps = account_capabilities(Platform.LINKEDIN, ["anything"])
    assert caps["live_capable"] is False and caps["publishing_authorized"] is False


# ── dry-run adapter ─────────────────────────────────────────────────────────────
def test_dry_run_adapter_never_calls_and_simulates():
    out = DryRunAdapter().publish({"snapshot": {"text": "hi", "content_format": "text"}}, token=None)
    assert out.ok and out.platform_post_id.startswith("dryrun_")
    assert out.response_meta["simulated"] is True


def test_factory_dry_run_by_default():
    assert isinstance(get_adapter(Platform.FACEBOOK, PublishMode.DRY_RUN), DryRunAdapter)
    assert isinstance(get_adapter(Platform.FACEBOOK, PublishMode.LIVE), MetaPublishAdapter)


# ── mocked Graph transport ───────────────────────────────────────────────────────
class _Graph:
    """Scripts Graph responses by matching URL substrings; records tokens seen."""
    def __init__(self, routes):
        self.routes = routes            # list of (substr, (status, body))
        self.calls = []
        self.tokens_seen = []

    def __call__(self, method, url, params):
        self.tokens_seen.append(params.get("access_token"))
        self.calls.append((method, url))
        for substr, resp in self.routes:
            if substr in url:
                return resp
        return 200, {"id": "default"}


def _fb_job(fmt="text", **snap):
    s = {"content_format": fmt, "text": "hello", "link": "", "media_asset_ids": []}
    s.update(snap)
    return {"account_id": "PAGE1", "snapshot": s, "_media_urls": snap.get("_media_urls", [])}


def test_facebook_text_success():
    g = _Graph([("/PAGE1/feed", (200, {"id": "PAGE1_99"}))])
    out = MetaPublishAdapter(Platform.FACEBOOK, transport=g).publish(_fb_job(), token="tok")
    assert out.ok and out.platform_post_id == "PAGE1_99"
    assert "facebook.com/PAGE1_99" in out.permalink
    assert g.tokens_seen == ["tok"]           # token passed but never in the outcome


def test_facebook_image_uses_photos_endpoint():
    g = _Graph([("/PAGE1/photos", (200, {"id": "PH1", "post_id": "PAGE1_PH"}))])
    job = _fb_job(fmt="image", media_asset_ids=["a1"])
    job["_media_urls"] = ["https://x/y.jpg"]
    out = MetaPublishAdapter(Platform.FACEBOOK, transport=g).publish(job, token="tok")
    assert out.ok and out.platform_post_id in ("PH1", "PAGE1_PH")


def test_facebook_expired_token_maps_reconnection():
    g = _Graph([("/PAGE1/feed", (400, {"error": {"code": 190, "message": "expired", "fbtrace_id": "T1"}}))])
    out = MetaPublishAdapter(Platform.FACEBOOK, transport=g).publish(_fb_job(), token="tok")
    assert not out.ok and out.error_category == "invalid_credentials"
    assert out.reconnection_required is True and out.platform_request_id == "T1"


def test_facebook_rate_limit_is_retryable():
    g = _Graph([("/PAGE1/feed", (400, {"error": {"code": 4, "message": "rate"}}))])
    out = MetaPublishAdapter(Platform.FACEBOOK, transport=g).publish(_fb_job(), token="tok")
    assert not out.ok and out.error_category == "rate_limited" and out.retryable is True


def test_facebook_permission_denied_not_retryable():
    g = _Graph([("/PAGE1/feed", (403, {"error": {"code": 200, "message": "no perm"}}))])
    out = MetaPublishAdapter(Platform.FACEBOOK, transport=g).publish(_fb_job(), token="tok")
    assert out.error_category == "permission_denied" and out.retryable is False


def _ig_job(fmt="image"):
    return {"account_id": "IG1", "snapshot": {"content_format": fmt, "text": "cap", "media_asset_ids": ["a1"]},
            "_media_urls": ["https://x/y.jpg"]}


def test_instagram_container_flow_success():
    g = _Graph([
        ("/IG1/media_publish", (200, {"id": "IGMEDIA1"})),   # most specific first
        ("/IG1/media", (200, {"id": "CREATION1"})),
        ("/IGMEDIA1", (200, {"permalink": "https://instagram.com/p/abc"})),
        ("/CREATION1", (200, {"status_code": "FINISHED"})),
    ])
    out = MetaPublishAdapter(Platform.INSTAGRAM, transport=g).publish(_ig_job(), token="tok")
    assert out.ok and out.platform_post_id == "IGMEDIA1"
    assert out.permalink.endswith("/p/abc")
    assert out.response_meta["creation_id"] == "CREATION1"


def test_instagram_container_error_status():
    g = _Graph([
        ("/IG1/media", (200, {"id": "CREATION1"})),
        ("/CREATION1", (200, {"status_code": "ERROR"})),
    ])
    out = MetaPublishAdapter(Platform.INSTAGRAM, transport=g).publish(_ig_job(), token="tok")
    assert not out.ok and out.error_category == "job_failed"


def test_instagram_processing_timeout():
    g = _Graph([
        ("/IG1/media", (200, {"id": "CREATION1"})),
        ("/CREATION1", (200, {"status_code": "IN_PROGRESS"})),  # never finishes
    ])
    out = MetaPublishAdapter(Platform.INSTAGRAM, transport=g, max_polls=3).publish(_ig_job(), token="tok")
    assert not out.ok and out.error_category == "provider_timeout" and out.retryable is True


def test_instagram_requires_media():
    job = {"account_id": "IG1", "snapshot": {"content_format": "image", "text": "cap", "media_asset_ids": []}, "_media_urls": []}
    out = MetaPublishAdapter(Platform.INSTAGRAM, transport=lambda *a: (200, {})).publish(job, token="tok")
    assert not out.ok and out.error_category == "unsupported_media"


def test_no_token_is_reconnection():
    out = MetaPublishAdapter(Platform.FACEBOOK, transport=lambda *a: (200, {})).publish(_fb_job(), token=None)
    assert not out.ok and out.reconnection_required is True
