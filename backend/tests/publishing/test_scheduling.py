"""Timezone-aware scheduling + idempotency fingerprint."""

from __future__ import annotations

import pytest

from publishing import fingerprint
from publishing.scheduling import ScheduleError, is_past, resolve, valid_timezone


def test_valid_timezone():
    assert valid_timezone("America/New_York")
    assert valid_timezone("UTC")
    assert not valid_timezone("Mars/Phobos")
    assert not valid_timezone("")


def test_standard_time_to_utc():
    # EST = UTC-5 in January
    r = resolve("2026-01-15T09:00", "America/New_York")
    assert r.utc_iso.startswith("2026-01-15T14:00")
    assert r.timezone == "America/New_York" and r.ambiguous is False


def test_dst_summer_offset():
    # EDT = UTC-4 in July
    r = resolve("2026-07-15T09:00", "America/New_York")
    assert r.utc_iso.startswith("2026-07-15T13:00")


def test_nonexistent_local_time_rejected():
    # 2026-03-08 02:30 does not exist in US Eastern (spring forward)
    with pytest.raises(ScheduleError):
        resolve("2026-03-08T02:30", "America/New_York")


def test_ambiguous_local_time_flagged():
    # 2026-11-01 01:30 occurs twice (fall back) in US Eastern
    r = resolve("2026-11-01T01:30", "America/New_York")
    assert r.ambiguous is True


def test_invalid_timezone_rejected():
    with pytest.raises(ScheduleError):
        resolve("2026-01-15T09:00", "Not/AZone")


def test_server_timezone_independence():
    # Same instant regardless of how it is expressed
    a = resolve("2026-01-15T12:00", "UTC")
    b = resolve("2026-01-15T07:00", "America/New_York")
    assert a.utc_iso == b.utc_iso


def test_is_past():
    assert is_past("2000-01-01T00:00:00+00:00") is True
    assert is_past("2099-01-01T00:00:00+00:00") is False


# ── fingerprint ────────────────────────────────────────────────────────────────
def _snap(text="hello", media=None):
    return {"content_format": "image", "text": text, "link": "", "media_asset_ids": media or ["a1"],
            "document_id": "d1", "version_id": "v1", "influencer_video_id": "", "first_comment": ""}


def test_fingerprint_stable_for_same_request():
    a = fingerprint.compute("ws", "c1", "facebook", "p1", _snap(), "2026-01-01T00:00:00+00:00", "dry_run")
    b = fingerprint.compute("ws", "c1", "facebook", "p1", _snap(), "2026-01-01T00:00:00+00:00", "dry_run")
    assert a == b and a.startswith("fp_")


def test_fingerprint_changes_when_content_edited():
    a = fingerprint.compute("ws", "c1", "facebook", "p1", _snap(text="one"), "t", "dry_run")
    b = fingerprint.compute("ws", "c1", "facebook", "p1", _snap(text="two"), "t", "dry_run")
    assert a != b


def test_fingerprint_media_order_insensitive():
    a = fingerprint.compute("ws", "c1", "facebook", "p1", _snap(media=["a", "b"]), "t", "dry_run")
    b = fingerprint.compute("ws", "c1", "facebook", "p1", _snap(media=["b", "a"]), "t", "dry_run")
    assert a == b


def test_explicit_idempotency_key_dominates():
    a = fingerprint.compute("ws", "c1", "facebook", "p1", _snap(text="x"), "t", "dry_run", idempotency_key="K")
    b = fingerprint.compute("ws", "c1", "facebook", "p1", _snap(text="DIFFERENT"), "t2", "live", idempotency_key="K")
    assert a == b  # same key → same job regardless of other fields


def test_fingerprint_tenant_scoped():
    a = fingerprint.compute("ws_A", "c1", "facebook", "p1", _snap(), "t", "dry_run")
    b = fingerprint.compute("ws_B", "c1", "facebook", "p1", _snap(), "t", "dry_run")
    assert a != b
