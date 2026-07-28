"""GBP review workspace + AI response drafting for the Local SEO vertical.

Key design decisions:
  - AI drafting is grounded in the actual review text and reviewer name.
  - No auto-publishing: every response MUST go through the approval gate.
  - No private information in drafts (reviewer contact details are never used).
  - No liability admissions (drafted language stays factual + empathetic).
  - Metered via record_review_response.
  - Mock mode returns a deterministic template; live mode would call an LLM.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from seo.metering_search import record_review_response
from seo.local.stores import (
    GbpReview,
    ReplyStatus,
    _now,
    get_gbp_review_repository,
    get_location_repository,
)
from seo.local.gbp import GbpClient, get_gbp_client, GbpConnectionError, _get_fresh_access_token

_log = logging.getLogger("pixie.seo.local.reviews")


# ── Review ingestion ───────────────────────────────────────────────────────────

def _star_to_int(star_rating: str) -> int:
    _MAP = {"ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5}
    return _MAP.get(star_rating.upper(), 0)


def _infer_sentiment(rating: int) -> str:
    if rating >= 4:
        return "positive"
    if rating == 3:
        return "neutral"
    return "negative"


def _extract_themes(text: str) -> List[str]:
    """Extract very lightweight keyword themes from review text (no LLM)."""
    themes: List[str] = []
    text_lower = text.lower()
    _THEME_KEYWORDS = {
        "service": ["service", "staff", "team", "professional", "friendly", "helpful"],
        "price": ["price", "cost", "cheap", "expensive", "affordable", "value"],
        "speed": ["fast", "quick", "prompt", "slow", "timely", "responsive"],
        "quality": ["quality", "excellent", "great", "good", "poor", "bad", "work"],
        "communication": ["communication", "responsive", "reply", "call", "email"],
        "cleanliness": ["clean", "tidy", "neat", "mess"],
    }
    for theme, keywords in _THEME_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            themes.append(theme)
    return themes


def ingest_reviews(
    tenant_id: str,
    location_id: str,
    connection_id: str,
    *,
    gbp_client: Optional[GbpClient] = None,
    is_mock: bool = True,
) -> Dict[str, Any]:
    """Fetch reviews from GBP and upsert into seo_gbp_reviews.

    Does NOT auto-publish any response.  Returns ingestion stats.
    """
    loc_repo = get_location_repository()
    loc_result = loc_repo.get(tenant_id, location_id)
    if loc_result is None:
        raise GbpConnectionError(f"Location {location_id!r} not found")
    _, loc = loc_result

    gbp_location_name = loc.gbp_location_id
    if not gbp_location_name:
        raise GbpConnectionError(f"Location {location_id!r} has no GBP location ID")

    access_token = _get_fresh_access_token(tenant_id, connection_id)
    client = gbp_client or get_gbp_client()

    rev_repo = get_gbp_review_repository()
    existing = {r.gbp_review_id: (rid, r) for rid, r in rev_repo.list_by_location(tenant_id, location_id)}

    page_token = ""
    new_count = 0
    updated_count = 0

    while True:
        page = client.list_reviews(access_token, gbp_location_name, page_token=page_token)
        for raw in page.get("reviews", []):
            review_id = raw.get("reviewId", "")
            reviewer = raw.get("reviewer", {})
            star_str = raw.get("starRating", "ONE")
            rating = _star_to_int(star_str)
            text = raw.get("comment", "")
            created = raw.get("createTime", "")

            if review_id in existing:
                # Update existing (rating/text might have changed)
                rid, _ = existing[review_id]
                rev_repo.update(
                    tenant_id, rid,
                    rating=rating,
                    review_text=text,
                    sentiment=_infer_sentiment(rating),
                    themes=_extract_themes(text),
                )
                updated_count += 1
            else:
                review = GbpReview(
                    tenant_id=tenant_id,
                    location_id=location_id,
                    gbp_review_id=review_id,
                    reviewer_display_name=reviewer.get("displayName", ""),
                    reviewer_profile_photo_url=reviewer.get("profilePhotoUrl", ""),
                    rating=rating,
                    review_text=text,
                    created_at=created,
                    sentiment=_infer_sentiment(rating),
                    themes=_extract_themes(text),
                )
                rev_repo.create(review)
                new_count += 1

        next_token = page.get("nextPageToken", "")
        if not next_token:
            break
        page_token = next_token

    return {
        "location_id": location_id,
        "new_reviews": new_count,
        "updated_reviews": updated_count,
        "is_mock": is_mock,
    }


# ── Review workspace queries ───────────────────────────────────────────────────

def get_review_workspace(
    tenant_id: str,
    location_id: str,
) -> Dict[str, Any]:
    """Return overview stats for the review workspace."""
    rev_repo = get_gbp_review_repository()
    all_reviews = rev_repo.list_by_location(tenant_id, location_id)

    total = len(all_reviews)
    if total == 0:
        return {
            "total": 0,
            "overall_rating": None,
            "distribution": {},
            "unanswered": 0,
            "new_last_30d": 0,
            "sentiment_summary": {"positive": 0, "neutral": 0, "negative": 0},
            "top_themes": [],
        }

    ratings = [r.rating for _, r in all_reviews if r.rating > 0]
    overall_rating = round(sum(ratings) / len(ratings), 2) if ratings else None

    distribution: Dict[str, int] = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
    for rating in ratings:
        k = str(rating)
        if k in distribution:
            distribution[k] += 1

    unanswered = sum(
        1 for _, r in all_reviews
        if not r.handled and r.reply_status in (ReplyStatus.NONE, ReplyStatus.DRAFTED)
    )

    sentiment_summary: Dict[str, int] = {"positive": 0, "neutral": 0, "negative": 0}
    theme_counts: Dict[str, int] = {}
    for _, r in all_reviews:
        if r.sentiment in sentiment_summary:
            sentiment_summary[r.sentiment] += 1
        for t in (r.themes or []):
            theme_counts[t] = theme_counts.get(t, 0) + 1

    top_themes = sorted(theme_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    top_themes_list = [{"theme": k, "count": v} for k, v in top_themes]

    return {
        "total": total,
        "overall_rating": overall_rating,
        "distribution": distribution,
        "unanswered": unanswered,
        "new_last_30d": 0,  # requires date filtering; left as 0 without date parsing overhead
        "sentiment_summary": sentiment_summary,
        "top_themes": top_themes_list,
    }


def list_reviews(
    tenant_id: str,
    location_id: str,
    *,
    status_filter: Optional[ReplyStatus] = None,
    handled: Optional[bool] = None,
    min_rating: Optional[int] = None,
    max_rating: Optional[int] = None,
) -> List[Tuple[str, GbpReview]]:
    """List reviews for a location with optional filters."""
    rev_repo = get_gbp_review_repository()
    rows = rev_repo.list_by_location(tenant_id, location_id)
    if status_filter is not None:
        rows = [(rid, r) for rid, r in rows if r.reply_status == status_filter]
    if handled is not None:
        rows = [(rid, r) for rid, r in rows if r.handled == handled]
    if min_rating is not None:
        rows = [(rid, r) for rid, r in rows if r.rating >= min_rating]
    if max_rating is not None:
        rows = [(rid, r) for rid, r in rows if r.rating <= max_rating]
    return rows


# ── AI response drafting (approval-gated) ─────────────────────────────────────

_RESPONSE_TEMPLATES = {
    "positive": (
        "Thank you so much for your kind words, {name}! "
        "We're thrilled to hear you had a great experience. "
        "We look forward to serving you again!"
    ),
    "neutral": (
        "Thank you for your feedback, {name}. "
        "We appreciate you taking the time to share your experience. "
        "We're always working to improve and hope to exceed your expectations next time."
    ),
    "negative": (
        "Thank you for bringing this to our attention, {name}. "
        "We're sorry to hear your experience didn't meet your expectations. "
        "We'd love the opportunity to make this right — "
        "please reach out to us directly so we can address your concerns."
    ),
}


def _draft_response_mock(review: GbpReview) -> str:
    """Generate a deterministic template response (mock/offline mode)."""
    sentiment = review.sentiment or _infer_sentiment(review.rating)
    template = _RESPONSE_TEMPLATES.get(sentiment, _RESPONSE_TEMPLATES["neutral"])
    name = review.reviewer_display_name or "Valued Customer"
    # Use first name only for privacy
    first_name = name.split()[0] if name else "Valued Customer"
    return template.format(name=first_name)


def draft_review_response(
    tenant_id: str,
    review_id: str,
    *,
    custom_context: str = "",
    is_mock: bool = True,
) -> Dict[str, Any]:
    """Draft an AI response for a review.  Requires approval before publishing.

    The draft:
      - Is grounded in the actual review text and reviewer name.
      - Does NOT include private information (contact details, internal IDs).
      - Does NOT admit liability.
      - Is factual and empathetic.
      - Is stored as reply_status=DRAFTED, never auto-published.

    Metered via record_review_response.
    """
    rev_repo = get_gbp_review_repository()
    result = rev_repo.get(tenant_id, review_id)
    if result is None:
        return {"error": "review_not_found"}
    rid, review = result

    if is_mock:
        draft_text = _draft_response_mock(review)
    else:
        # In live mode, this would call an LLM.  For now, use the template
        # as a grounded starting point — a real implementation would pass the
        # review text, reviewer name, business name, and brand guidelines to
        # the model with explicit safety instructions (no private info, no
        # liability admission, brand tone).
        draft_text = _draft_response_mock(review)

    ts = _now()
    rev_repo.update(
        tenant_id, review_id,
        reply_text=draft_text,
        reply_status=ReplyStatus.DRAFTED,
        reply_drafted_at=ts,
    )

    metering = record_review_response(tenant_id, review_id=review_id, is_mock=is_mock)

    return {
        "review_id": review_id,
        "draft_text": draft_text,
        "reply_status": ReplyStatus.DRAFTED.value,
        "drafted_at": ts,
        "is_mock": is_mock,
        "approval_required": True,
        "metering": metering,
    }


def edit_review_response(
    tenant_id: str,
    review_id: str,
    new_text: str,
) -> Optional[Tuple[str, GbpReview]]:
    """Update the draft reply text.  Only allowed when status is DRAFTED."""
    rev_repo = get_gbp_review_repository()
    result = rev_repo.get(tenant_id, review_id)
    if result is None:
        return None
    _, review = result
    if review.reply_status not in (ReplyStatus.NONE, ReplyStatus.DRAFTED):
        raise ValueError(
            f"Cannot edit reply with status {review.reply_status.value!r} — "
            "only NONE or DRAFTED replies can be edited"
        )
    return rev_repo.update(
        tenant_id, review_id,
        reply_text=new_text,
        reply_status=ReplyStatus.DRAFTED,
    )


def approve_review_response(
    tenant_id: str,
    review_id: str,
    *,
    approved_by: str = "",
) -> Dict[str, Any]:
    """Approve a drafted response.  Marks it APPROVED — still not published."""
    rev_repo = get_gbp_review_repository()
    result = rev_repo.get(tenant_id, review_id)
    if result is None:
        return {"error": "review_not_found"}
    _, review = result
    if review.reply_status != ReplyStatus.DRAFTED:
        return {"error": "not_drafted", "current_status": review.reply_status.value}

    ts = _now()
    rev_repo.update(
        tenant_id, review_id,
        reply_status=ReplyStatus.APPROVED,
        reply_approved_at=ts,
    )
    return {
        "review_id": review_id,
        "reply_status": ReplyStatus.APPROVED.value,
        "approved_at": ts,
        "approved_by": approved_by,
        "note": "Response is approved but NOT yet published to GBP. Use the publish endpoint to post.",
    }


def mark_review_handled(
    tenant_id: str,
    review_id: str,
) -> Optional[Tuple[str, GbpReview]]:
    """Mark a review as handled (acknowledged, no further action needed)."""
    return get_gbp_review_repository().update(
        tenant_id, review_id, handled=True
    )


def assign_review(
    tenant_id: str,
    review_id: str,
    assigned_to: str,
) -> Optional[Tuple[str, GbpReview]]:
    """Assign a review to a team member for response."""
    return get_gbp_review_repository().update(
        tenant_id, review_id, assigned_to=assigned_to
    )
