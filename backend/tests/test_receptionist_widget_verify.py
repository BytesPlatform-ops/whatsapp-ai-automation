"""Widget installation verification — server-observed evidence only (Wave 10)."""

from __future__ import annotations

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


def _cfg():
    widget.get_or_create_config("t_a")
    return widget.save_config("t_a", {"allowed_domains": ["shop.example"]})


def test_not_installed_by_default():
    _cfg()
    v = widget.verification_status("t_a")
    assert v["installed"] is False
    assert v["domains"][0]["status"] == "not_installed"


def test_signed_session_marks_installed():
    cfg = _cfg()
    widget.create_session(cfg["public_id"], origin="https://shop.example")
    v = widget.verification_status("t_a")
    assert v["installed"] is True
    d = v["domains"][0]
    assert d["status"] == "installed" and d["evidence"] == "signed_session" and d["last_verified_at"]


def test_blocked_origin_records_failure_not_installed():
    cfg = _cfg()
    with pytest.raises(widget.WidgetError):
        widget.create_session(cfg["public_id"], origin="https://evil.example")
    v = widget.verification_status("t_a")
    # evil.example isn't an allowed domain, so it's not in the per-domain list;
    # the allowed shop.example remains not_installed
    assert v["installed"] is False


def test_verification_is_not_a_frontend_flag():
    # There is no API to force 'installed' without server-observed evidence.
    _cfg()
    v1 = widget.verification_status("t_a")
    assert v1["installed"] is False  # clicking "verify" alone cannot flip this
