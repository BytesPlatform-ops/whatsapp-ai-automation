"""Deterministic feed rules — the engine that turns BusinessSignals into cards.

NO AI, NO network: pure functions, fully testable. Each rule is a small predicate
over the signals that emits one card. Omni AI (later) only ranks/rewrites the
output of this; it never replaces these rules and never executes actions.
"""

from __future__ import annotations

from .schemas import (
    BusinessSignals,
    FeedAgent,
    FeedCard,
    FeedCardAction,
    FeedCategory,
    FeedPriority,
)


def _a(id_: str, label: str, type_: str, confirm: bool = False) -> FeedCardAction:
    return FeedCardAction(id=id_, label=label, type=type_, requires_confirmation=confirm)


def generate_cards(s: BusinessSignals) -> list[FeedCard]:
    """Run every starter rule over the signals, then sort by priority. Dedup is
    implicit (each rule emits a uniquely-id'd card at most once)."""
    cards: list[FeedCard] = []

    # 1 — no website
    if not s.has_website:
        cards.append(FeedCard(
            id="r_website_publish", heading="Publish your first website",
            full_idea="Your draft homepage is ready — publish it to a live link customers can visit and book from.",
            reason="Pixie built a homepage but it's still in draft.",
            category=FeedCategory.setup, priority=FeedPriority.high, primary_agent=FeedAgent.website,
            source_signals=["has_website=false"], outcome="A live, shareable site.",
            actions=[_a("a1", "Preview", "preview"), _a("a2", "Publish", "do_this", True), _a("a3", "Skip", "skip")],
        ))
    # 2 — weak homepage CTA (only if a site exists)
    elif s.homepage_cta_weak:
        cards.append(FeedCard(
            id="r_homepage_cta", heading="Boost your homepage booking CTA",
            full_idea="Move 'Book now' above the fold and brighten it to lift bookings from the same traffic.",
            reason="Above-the-fold CTAs convert ~1.5-2x better.",
            category=FeedCategory.growth, priority=FeedPriority.medium, primary_agent=FeedAgent.website,
            source_signals=["homepage_cta_weak=true"], outcome="More bookings, same traffic.",
            actions=[_a("a1", "Preview", "preview"), _a("a2", "Approve", "approve"), _a("a3", "Edit", "edit")],
        ))

    # 3 — receptionist channels not connected
    if s.channels_connected == 0:
        cards.append(FeedCard(
            id="r_connect_channels", heading="Connect customer message channels",
            full_idea="Link WhatsApp or web chat so your Receptionist can answer customers and capture leads automatically.",
            reason="No channels are connected, so the Receptionist can't reply.",
            category=FeedCategory.setup, priority=FeedPriority.high, primary_agent=FeedAgent.receptionist,
            source_signals=["channels_connected=0"], outcome="Customers answered 24/7.",
            actions=[_a("a1", "Connect", "connect"), _a("a2", "Not relevant", "not_relevant")],
        ))

    # 4 — unanswered leads
    if s.unanswered_leads > 0:
        cards.append(FeedCard(
            id="r_leads_followup", heading=f"{_word(s.unanswered_leads)} leads need follow-up",
            full_idea="Recent leads haven't heard back. Pixie drafted a friendly reply for each — approve to send.",
            reason="Leads older than 2h convert far less often.",
            category=FeedCategory.customer_attention, priority=FeedPriority.urgent, primary_agent=FeedAgent.receptionist,
            source_signals=[f"unanswered_leads={s.unanswered_leads}"], outcome="Warm leads re-engaged.",
            actions=[_a("a1", "Approve replies", "approve", True), _a("a2", "Edit", "edit"), _a("a3", "Remind me later", "remind_later")],
        ))

    # 5 — no post in 7+ days
    if s.days_since_last_post >= 7:
        cards.append(FeedCard(
            id="r_content_plan", heading="Plan this week's content",
            full_idea="Pixie drafted a 7-day posting plan tuned to your audience and offers — captions and hooks included.",
            reason=f"No posts went out in {s.days_since_last_post} days.",
            category=FeedCategory.content_marketing, priority=FeedPriority.medium, primary_agent=FeedAgent.marketing,
            source_signals=[f"days_since_last_post={s.days_since_last_post}"], outcome="A full week of posts queued.",
            actions=[_a("a1", "Review plan", "preview"), _a("a2", "Edit", "edit"), _a("a3", "Skip", "skip")],
        ))

    # 6 — SEO meta missing
    if s.seo_pages_missing_meta > 0:
        cards.append(FeedCard(
            id="r_seo_meta", heading="Add missing meta titles",
            full_idea=f"{s.seo_pages_missing_meta} pages are missing meta titles. Pixie wrote optimized ones to apply.",
            reason="Missing meta titles lower click-through from search.",
            category=FeedCategory.website_seo, priority=FeedPriority.medium, primary_agent=FeedAgent.seo,
            source_signals=[f"seo_pages_missing_meta={s.seo_pages_missing_meta}"], outcome="Better search click-through.",
            actions=[_a("a1", "Preview", "preview"), _a("a2", "Apply fixes", "do_this", True), _a("a3", "Skip", "skip")],
        ))

    # 7 — reel script ready
    if s.reel_script_ready:
        cards.append(FeedCard(
            id="r_reel_script", heading="Your reel script is ready",
            full_idea="Pixie wrote a 22-second reel script around your offer, with a hook, 3 beats, and a CTA.",
            reason="You post best on weekends and haven't scheduled anything.",
            category=FeedCategory.ready_to_approve, priority=FeedPriority.high, primary_agent=FeedAgent.content,
            source_signals=["reel_script_ready=true"], outcome="A reel ready to film.",
            actions=[_a("a1", "Approve", "approve"), _a("a2", "Preview", "preview"), _a("a3", "Edit", "edit")],
        ))

    # 8 — low credits
    if s.credits_pct <= 15:
        cards.append(FeedCard(
            id="r_credits", heading="Credits are running low",
            full_idea=f"You have ~{s.credits_pct}% credits left. Top up to keep generation and audits running.",
            reason="Generation pauses when credits hit zero.",
            category=FeedCategory.system, priority=FeedPriority.medium, primary_agent=FeedAgent.pixie,
            source_signals=[f"credits_pct={s.credits_pct}"],
            actions=[_a("a1", "Top up", "do_this"), _a("a2", "Remind me later", "remind_later")],
        ))

    # 9 — business hours missing
    if not s.business_hours_set:
        cards.append(FeedCard(
            id="r_hours", heading="Add your business hours",
            full_idea="Pixie needs your opening hours to answer 'are you open?' and set booking availability.",
            reason="Hours are missing from your business profile.",
            category=FeedCategory.setup, priority=FeedPriority.low, primary_agent=FeedAgent.receptionist,
            source_signals=["business_hours_set=false"],
            actions=[_a("a1", "Add hours", "do_this"), _a("a2", "Skip", "skip")],
        ))

    # 11 — reviews to reply
    if s.reviews_to_reply > 0:
        cards.append(FeedCard(
            id="r_reviews", heading=f"Reply to {_word(s.reviews_to_reply)} new reviews",
            full_idea="New reviews came in. Pixie drafted warm, on-brand replies — approve to post them.",
            reason="Replying to reviews builds trust and local ranking.",
            category=FeedCategory.customer_attention, priority=FeedPriority.medium, primary_agent=FeedAgent.receptionist,
            source_signals=[f"reviews_to_reply={s.reviews_to_reply}"], outcome="Happier customers, better ranking.",
            actions=[_a("a1", "Review drafts", "preview"), _a("a2", "Approve", "approve", True), _a("a3", "Skip", "skip")],
        ))

    # 12 — Google Business unclaimed
    if s.google_business_unclaimed:
        cards.append(FeedCard(
            id="r_gbp", heading="Claim your Google listing",
            full_idea="Your Google Business Profile isn't claimed. Claiming it puts you on Maps and local search.",
            reason="Local customers find you through Google Maps first.",
            category=FeedCategory.website_seo, priority=FeedPriority.medium, primary_agent=FeedAgent.seo,
            source_signals=["google_business_unclaimed=true"], outcome="Show up on Google Maps.",
            actions=[_a("a1", "Start", "do_this"), _a("a2", "Skip", "skip")],
        ))

    # 13 — testimonials
    if s.no_testimonials and s.has_website:
        cards.append(FeedCard(
            id="r_testimonials", heading="Add testimonials to your homepage",
            full_idea="Pixie can pull your best reviews into a trust strip near your booking CTA.",
            reason="Social proof near a CTA lifts conversions.",
            category=FeedCategory.growth, priority=FeedPriority.low, primary_agent=FeedAgent.website,
            source_signals=["no_testimonials=true"], outcome="More trust, more bookings.",
            actions=[_a("a1", "Draft it", "do_this"), _a("a2", "Skip", "skip")],
        ))

    # 14 — appointment reminders
    if s.appointment_reminders_off:
        cards.append(FeedCard(
            id="r_reminders", heading="Turn on appointment reminders",
            full_idea="Auto-send a reminder before each booking to cut no-shows.",
            reason="Reminders reduce no-shows by up to 30%.",
            category=FeedCategory.customer_attention, priority=FeedPriority.low, primary_agent=FeedAgent.receptionist,
            source_signals=["appointment_reminders_off=true"], outcome="Fewer no-shows.",
            actions=[_a("a1", "Enable", "do_this"), _a("a2", "Not relevant", "not_relevant")],
        ))

    # 15 — weekend offer
    if s.weekend_offer_idea:
        cards.append(FeedCard(
            id="r_weekend_offer", heading="Launch a weekend offer",
            full_idea="Pixie spotted a quiet weekend coming up and drafted a limited-time offer + posts to fill it.",
            reason="Targeted offers lift slow periods.",
            category=FeedCategory.content_marketing, priority=FeedPriority.medium, primary_agent=FeedAgent.marketing,
            source_signals=["weekend_offer_idea=true"], outcome="A busier weekend.",
            actions=[_a("a1", "See offer", "preview"), _a("a2", "Approve", "approve", True), _a("a3", "Skip", "skip")],
        ))

    # 16 — product photos
    if s.no_product_photos:
        cards.append(FeedCard(
            id="r_product_photos", heading="Add your product photos",
            full_idea="Upload a few product photos so Pixie can use them across your site, posts, and ads.",
            reason="Real photos outperform stock everywhere.",
            category=FeedCategory.setup, priority=FeedPriority.low, primary_agent=FeedAgent.website,
            source_signals=["no_product_photos=true"], outcome="Stronger visuals everywhere.",
            actions=[_a("a1", "Upload", "do_this"), _a("a2", "Later", "remind_later")],
        ))

    # 10 — locked agents → upsell card
    if s.locked_agents:
        names = ", ".join(a.value if hasattr(a, "value") else str(a) for a in s.locked_agents)
        cards.append(FeedCard(
            id="r_unlock", heading="Unlock more Pixie actions",
            full_idea=f"You haven't enabled {names} yet. Start a free trial to see what each can do for your business.",
            reason="Locked agents can still help — try them free.",
            category=FeedCategory.growth, priority=FeedPriority.low, primary_agent=FeedAgent.pixie,
            source_signals=[f"locked_agents={len(s.locked_agents)}"],
            actions=[_a("a1", "Explore agents", "open_agent"), _a("a2", "Start a trial", "start_trial")],
        ))

    cards.sort(key=lambda c: c.rank())
    return cards


def health_score(s: BusinessSignals) -> int:
    """A simple deterministic 0-100 business-readiness score from the signals."""
    score = 100
    if not s.has_website:
        score -= 22
    if s.channels_connected == 0:
        score -= 16
    if not s.business_hours_set:
        score -= 8
    if s.seo_pages_missing_meta > 0:
        score -= 8
    if s.days_since_last_post >= 7:
        score -= 8
    score -= min(20, s.unanswered_leads * 4)
    return max(10, min(100, score))


_WORDS = {1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five"}


def _word(n: int) -> str:
    return _WORDS.get(n, str(n))
