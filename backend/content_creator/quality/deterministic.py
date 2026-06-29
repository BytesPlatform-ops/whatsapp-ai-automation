"""Deterministic quality checks — PURE STDLIB, NO LLM, never raises.

These are the cheap, objective invariants every generated video must satisfy
before it can reach the (LLM-based) judge or publish gate:
  * correct target duration and 9:16 vertical aspect,
  * the locked identity, chosen background and script all survived generation,
  * the production gate (Gate 3) was approved before any spend,
  * and in mock mode the asset is honestly flagged as a mock.

Any failed check id is collected into deterministic_flags; a non-empty list
forces a NEEDS_RETRY verdict.
"""

from __future__ import annotations

from content_creator.config import mock_mode
from content_creator.enums import QualityStatus

TARGET_DURATION_SECONDS = 15
TARGET_ASPECT_RATIO = "9:16"


def run_deterministic_checks(video: dict, *, state: dict) -> dict:
    video = video or {}
    state = state or {}
    approvals = state.get("approvals", {}) or {}

    checks = []

    def add(check_id: str, ok: bool, detail: str) -> None:
        checks.append({"id": check_id, "ok": bool(ok), "detail": detail})

    add(
        "duration_match",
        video.get("duration_seconds") == TARGET_DURATION_SECONDS,
        "duration must be %ds (got %r)"
        % (TARGET_DURATION_SECONDS, video.get("duration_seconds")),
    )
    add(
        "identity_present",
        bool(video.get("identity_ref")),
        "locked identity_ref must be present",
    )
    add(
        "background_present",
        bool(video.get("background")),
        "background must be present",
    )
    add(
        "script_included",
        bool(video.get("script")),
        "script must be present",
    )
    add(
        "aspect_ratio_9_16",
        video.get("aspect_ratio") == TARGET_ASPECT_RATIO,
        "aspect_ratio must be %s (got %r)"
        % (TARGET_ASPECT_RATIO, video.get("aspect_ratio")),
    )
    add(
        "production_approved",
        approvals.get("production") == "approved",
        "Gate 3 (production) must be approved before quality",
    )
    add(
        "mock_respected",
        (video.get("status") == "mock") if mock_mode() else True,
        "in mock mode the asset status must be 'mock'",
    )

    deterministic_flags = [c["id"] for c in checks if not c["ok"]]
    passed = not deterministic_flags
    status = (
        QualityStatus.PASS.value if passed else QualityStatus.NEEDS_RETRY.value
    )

    return {
        "status": status,
        "passed": passed,
        "deterministic_flags": deterministic_flags,
        "checks": checks,
    }
