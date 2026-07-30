"""Website Chat widget — signed sessions, domain allowlist, rate limiting (Wave 8)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from receptionist.service import widget


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("AI_RECEPTIONIST_WIDGET_SESSION_SECRET", "test-secret")
    from receptionist.service import stores
    stores.reset_all()
    yield
    stores.reset_all()


def _cfg(domains=None, dev=False):
    widget.get_or_create_config("t_a")
    return widget.save_config("t_a", {"allowed_domains": domains or ["shop.example"], "dev_mode": dev})


# ── domain allowlist ──────────────────────────────────────────────────────────

def test_domain_normalisation():
    assert widget.normalise_domain("HTTPS://Shop.Example/path") == "shop.example"


def test_origin_allowed_https_only_in_prod():
    cfg = _cfg(["shop.example"])
    assert widget.origin_allowed(cfg, "https://shop.example")
    assert not widget.origin_allowed(cfg, "http://shop.example")   # prod requires https
    assert not widget.origin_allowed(cfg, "https://evil.example")


def test_wildcard_subdomain_bounded():
    cfg = _cfg(["*.shop.example"])
    assert widget.origin_allowed(cfg, "https://app.shop.example")
    assert not widget.origin_allowed(cfg, "https://shop.example")  # bare apex not matched by *.


def test_dev_mode_allows_localhost():
    cfg = _cfg(["shop.example"], dev=True)
    assert widget.origin_allowed(cfg, "http://localhost:3000")


# ── signed sessions ───────────────────────────────────────────────────────────

def test_session_roundtrip_no_tenant_in_token():
    cfg = _cfg()
    s = widget.create_session(cfg["public_id"], origin="https://shop.example")
    assert "t_a" not in s["session_token"]  # tenant id is never in the token
    claims = widget.verify_session(s["session_token"], origin="https://shop.example")
    assert claims["tenant_id"] == "t_a" and claims["visitor_id"] == s["visitor_id"]


def test_session_rejects_bad_origin():
    cfg = _cfg()
    with pytest.raises(widget.WidgetError) as e:
        widget.create_session(cfg["public_id"], origin="https://evil.example")
    assert e.value.category == "origin_not_allowed"


def test_tampered_token_rejected():
    cfg = _cfg()
    s = widget.create_session(cfg["public_id"], origin="https://shop.example")
    tampered = s["session_token"][:-3] + "xyz"
    with pytest.raises(widget.WidgetError) as e:
        widget.verify_session(tampered, origin="https://shop.example")
    assert e.value.category == "bad_signature"


def test_expired_session_rejected():
    cfg = _cfg()
    past = datetime.now(timezone.utc) - timedelta(hours=2)
    s = widget.create_session(cfg["public_id"], origin="https://shop.example", now=past)
    with pytest.raises(widget.WidgetError) as e:
        widget.verify_session(s["session_token"], origin="https://shop.example")
    assert e.value.category == "session_expired"


def test_revoked_widget_blocks_session():
    cfg = _cfg()
    s = widget.create_session(cfg["public_id"], origin="https://shop.example")
    widget.save_config("t_a", {"enabled": False})
    with pytest.raises(widget.WidgetError) as e:
        widget.verify_session(s["session_token"], origin="https://shop.example")
    assert e.value.category == "widget_revoked"


def test_rotation_preserves_visitor_and_conversation():
    cfg = _cfg()
    s = widget.create_session(cfg["public_id"], origin="https://shop.example", conversation_id="conv1")
    r = widget.rotate_session(s["session_token"], origin="https://shop.example")
    claims = widget.verify_session(r["session_token"], origin="https://shop.example")
    assert claims["visitor_id"] == s["visitor_id"] and claims["conversation_id"] == "conv1"


# ── rate limiting + message validation ────────────────────────────────────────

def test_rate_limit_blocks_burst(monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_WIDGET_RATE_LIMIT", "3")
    _cfg()
    now = datetime(2026, 8, 3, 10, 0, tzinfo=timezone.utc)
    allowed = [widget.check_rate("t_a", "ip:1.2.3.4", now=now) for _ in range(5)]
    assert allowed[:3] == [True, True, True] and allowed[3] is False


def test_message_validation():
    with pytest.raises(widget.WidgetError):
        widget.validate_message("")
    widget.validate_message("hello")  # ok
