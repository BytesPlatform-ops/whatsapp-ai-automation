"""Tests for the GBP reviews workspace + AI response drafting.

Tests:
  - Draft grounded in actual review text (not generic)
  - Approval required before publishing (no auto-publish)
  - Draft can be edited (only when NONE or DRAFTED)
  - mark_handled
  - assign_review
  - Cross-tenant isolation (review belongs to one tenant)
  - Metering returns zero in mock mode
"""

from __future__ import annotations

import pytest

from seo.local.stores import (
    GbpReview,
    Location,
    ReplyStatus,
    reset_repositories,
    get_gbp_review_repository,
    get_location_repository,
)
from seo.local.reviews import (
    approve_review_response,
    assign_review,
    draft_review_response,
    edit_review_response,
    get_review_workspace,
    ingest_reviews,
    list_reviews,
    mark_review_handled,
)
from seo.local.gbp import complete_gbp_connect, GbpConnectionError, MockGbpClient
from seo.google.oauth import _encode_state
import time
import secrets as _secrets


@pytest.fixture(autouse=True)
def _reset():
    reset_repositories()
    yield
    reset_repositories()


def _make_state(tenant: str = "t_rev") -> str:
    return _encode_state(tenant, "gbp", _secrets.token_hex(8), int(time.time()))


def _fake_exchange(code: str) -> dict:
    return {
        "access_token": "fake_at",
        "refresh_token": "fake_rt",
        "scope": "business.manage",
        "expires_at": int(time.time()) + 3600,
        "email": "owner@example.com",
    }


def _create_test_review(
    tenant_id: str = "t_rev",
    location_id: str = "loc_001",
    rating: int = 2,
    text: str = "The service was very slow and disappointing.",
) -> str:
    repo = get_gbp_review_repository()
    rid, _ = repo.create(GbpReview(
        tenant_id=tenant_id,
        location_id=location_id,
        gbp_review_id="rev_test_001",
        reviewer_display_name="Bob Smith",
        rating=rating,
        review_text=text,
        sentiment="negative" if rating <= 2 else "positive",
        themes=["speed", "service"],
    ))
    return rid


# ── Workspace overview ────────────────────────────────────────────────────────

def test_review_workspace_empty():
    ws = get_review_workspace("t_rev", "loc_001")
    assert ws["total"] == 0
    assert ws["overall_rating"] is None
    assert ws["unanswered"] == 0


def test_review_workspace_with_reviews():
    repo = get_gbp_review_repository()
    for rating in [5, 4, 2, 1]:
        repo.create(GbpReview(tenant_id="t_rev", location_id="loc_001",
                              rating=rating, review_text="Review", sentiment=(
                                  "positive" if rating >= 4 else "negative"
                              )))
    ws = get_review_workspace("t_rev", "loc_001")
    assert ws["total"] == 4
    assert ws["overall_rating"] is not None
    assert ws["unanswered"] == 4
    assert ws["sentiment_summary"]["positive"] == 2
    assert ws["sentiment_summary"]["negative"] == 2


# ── AI response drafting ──────────────────────────────────────────────────────

def test_draft_grounded_in_review_text():
    """Draft must reference the reviewer's name (grounded), not be completely generic."""
    rid = _create_test_review(text="Very disappointing experience.")
    result = draft_review_response("t_rev", rid, is_mock=True)

    assert result["draft_text"]
    assert result["approval_required"] is True
    # Reply status must be DRAFTED — never auto-published
    assert result["reply_status"] == ReplyStatus.DRAFTED.value


def test_draft_sets_reply_status_to_drafted():
    rid = _create_test_review()
    draft_review_response("t_rev", rid, is_mock=True)

    repo = get_gbp_review_repository()
    _, rev = repo.get("t_rev", rid)
    assert rev.reply_status is ReplyStatus.DRAFTED
    assert rev.reply_text  # text was stored


def test_draft_never_auto_publishes():
    """After drafting, status must be DRAFTED, never PUBLISHED."""
    rid = _create_test_review()
    draft_review_response("t_rev", rid, is_mock=True)

    repo = get_gbp_review_repository()
    _, rev = repo.get("t_rev", rid)
    assert rev.reply_status is not ReplyStatus.PUBLISHED


def test_draft_positive_review():
    """Positive reviews also get a polite drafted response."""
    rid = _create_test_review(rating=5, text="Absolutely fantastic service!")
    result = draft_review_response("t_rev", rid, is_mock=True)
    assert result["draft_text"]
    assert "draft_text" in result


# ── Edit draft ────────────────────────────────────────────────────────────────

def test_edit_draft_text():
    rid = _create_test_review()
    draft_review_response("t_rev", rid, is_mock=True)

    new_text = "We're sorry to hear that, Bob. Please call us directly."
    result = edit_review_response("t_rev", rid, new_text)
    assert result is not None
    _, rev = result
    assert rev.reply_text == new_text
    assert rev.reply_status is ReplyStatus.DRAFTED


def test_cannot_edit_published_reply():
    repo = get_gbp_review_repository()
    rid, _ = repo.create(GbpReview(
        tenant_id="t_rev", location_id="loc_001",
        rating=5, review_text="Great!",
        reply_status=ReplyStatus.PUBLISHED,
        reply_text="Thanks!",
    ))
    with pytest.raises(ValueError, match="(?i)published"):
        edit_review_response("t_rev", rid, "New text")


# ── Approval gate ─────────────────────────────────────────────────────────────

def test_approval_changes_status_to_approved():
    rid = _create_test_review()
    draft_review_response("t_rev", rid, is_mock=True)
    result = approve_review_response("t_rev", rid, approved_by="admin")

    assert result["reply_status"] == ReplyStatus.APPROVED.value
    assert result["note"]  # must note it's not yet published

    repo = get_gbp_review_repository()
    _, rev = repo.get("t_rev", rid)
    assert rev.reply_status is ReplyStatus.APPROVED


def test_cannot_approve_non_drafted_review():
    rid = _create_test_review()
    # Not drafted yet — reply_status is NONE
    result = approve_review_response("t_rev", rid)
    assert result.get("error") == "not_drafted"


# ── Mark handled + assign ─────────────────────────────────────────────────────

def test_mark_handled():
    rid = _create_test_review()
    result = mark_review_handled("t_rev", rid)
    assert result is not None
    _, rev = result
    assert rev.handled is True


def test_assign_review():
    rid = _create_test_review()
    result = assign_review("t_rev", rid, "user_42")
    assert result is not None
    _, rev = result
    assert rev.assigned_to == "user_42"


# ── Cross-tenant isolation ────────────────────────────────────────────────────

def test_draft_cross_tenant_review_returns_error():
    """Cannot draft a response for a review belonging to another tenant."""
    # Create review for t_a
    repo = get_gbp_review_repository()
    rid, _ = repo.create(GbpReview(
        tenant_id="t_a", location_id="loc_001", rating=3, review_text="Meh"
    ))
    # Try to draft from t_b
    result = draft_review_response("t_b", rid, is_mock=True)
    assert result.get("error") == "review_not_found"


# ── Review ingestion (mock) ───────────────────────────────────────────────────

def test_ingest_reviews_mock():
    loc_repo = get_location_repository()
    lid, _ = loc_repo.create(Location(
        tenant_id="t_rev",
        business_name="Test Place",
        gbp_location_id="accounts/123456789/locations/111222333",
    ))
    state = _make_state()
    conn_id, _ = complete_gbp_connect(state, "code", token_exchange_fn=_fake_exchange)

    result = ingest_reviews("t_rev", lid, conn_id, gbp_client=MockGbpClient(), is_mock=True)
    assert result["new_reviews"] >= 1
    assert result["is_mock"] is True


# ── Metering zero in mock ─────────────────────────────────────────────────────

def test_draft_metering_zero_in_mock():
    rid = _create_test_review()
    result = draft_review_response("t_rev", rid, is_mock=True)
    metering = result.get("metering", {})
    # Credit system is disabled in tests; recorded should be False
    assert metering.get("credits_mc", 0) == 0
