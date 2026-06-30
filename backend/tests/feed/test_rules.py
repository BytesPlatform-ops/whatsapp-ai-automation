"""Feed rules engine tests — deterministic, $0, no network. Plain test_* funcs."""

from __future__ import annotations

from feed.rules import generate_cards, health_score
from feed.schemas import BusinessSignals, FeedAgent, FeedPriority


def test_new_tenant_gets_a_full_nonempty_feed():
    cards = generate_cards(BusinessSignals())
    assert len(cards) >= 6, "a fresh tenant should still get starter cards"


def test_cards_sorted_by_priority_urgent_first():
    cards = generate_cards(BusinessSignals())
    ranks = [c.rank() for c in cards]
    assert ranks == sorted(ranks), "cards must be priority-sorted"
    assert cards[0].priority == FeedPriority.urgent.value


def test_no_website_emits_publish_card_and_suppresses_cta_card():
    cards = generate_cards(BusinessSignals(has_website=False, homepage_cta_weak=True))
    ids = {c.id for c in cards}
    assert "r_website_publish" in ids
    assert "r_homepage_cta" not in ids, "CTA card only when a site exists"


def test_existing_website_swaps_to_cta_card():
    cards = generate_cards(BusinessSignals(has_website=True, homepage_cta_weak=True))
    ids = {c.id for c in cards}
    assert "r_website_publish" not in ids
    assert "r_homepage_cta" in ids


def test_clean_business_has_minimal_cards():
    clean = BusinessSignals(
        has_website=True, homepage_cta_weak=False, channels_connected=2,
        unanswered_leads=0, days_since_last_post=0, seo_pages_missing_meta=0,
        reel_script_ready=False, credits_pct=80, business_hours_set=True,
        no_testimonials=False, google_business_unclaimed=False, reviews_to_reply=0,
        appointment_reminders_off=False, weekend_offer_idea=False, no_product_photos=False,
    )
    cards = generate_cards(clean)
    assert cards == [], "a fully set-up tenant has no pending starter cards"


def test_locked_agents_emit_upsell_card():
    cards = generate_cards(BusinessSignals(locked_agents=[FeedAgent.seo, FeedAgent.marketing]))
    assert any(c.id == "r_unlock" for c in cards)


def test_health_score_bounds_and_monotonicity():
    worst = health_score(BusinessSignals())
    best = health_score(BusinessSignals(
        has_website=True, channels_connected=2, unanswered_leads=0,
        days_since_last_post=0, seo_pages_missing_meta=0, business_hours_set=True,
    ))
    assert 10 <= worst <= 100 and 10 <= best <= 100
    assert best > worst


def test_headings_are_short():
    for c in generate_cards(BusinessSignals()):
        assert len(c.heading.split()) <= 7, f"heading too long: {c.heading!r}"


if __name__ == "__main__":  # allow direct run without pytest
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)
