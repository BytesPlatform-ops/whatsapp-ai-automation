"""Tenant data for the receptionist — the BUSINESS INFO variables injected into
the runtime prompt. Same prompt + different tenant data = a receptionist for any
business.

Step 1 ships a hard-coded SAMPLE tenant + a loader stub. Step 7 swaps the loader
for a DB/RAG lookup keyed by tenant_id (with strict per-tenant isolation).
"""

from __future__ import annotations

# Keys MUST match the {{VARS}} in prompts/RECEPTIONIST_RUNTIME_PROMPT.md.
SAMPLE_TENANT: dict[str, str] = {
    "BUSINESS_NAME": "Glow & Go Salon",
    "BUSINESS_TYPE": "hair & beauty salon",
    "BRAND_TONE": "warm, upbeat, professional",
    "LANGUAGES": "English, Urdu, Roman Urdu",
    "HOURS": "Tue–Sun 10:00–19:00; closed Mondays",
    "TIMEZONE": "Asia/Karachi",
    "LOCATION": "Block C, Gulberg III, Lahore (parking behind the building)",
    "CONTACT_INFO": "0300-1234567, hello@glowandgo.pk",
    "WEBSITE_LINKS": "glowandgo.pk",
    "SERVICES": "Haircut (women) Rs 2,500; Hair color from Rs 6,000; Bridal makeup from Rs 25,000; Hydrafacial Rs 8,000; Manicure Rs 1,500",
    "PRICING": "As listed in Services; bridal + color are quoted after consultation",
    "DISCOUNT_RULES": "10% off for first-time clients; no other discounts without manager approval",
    "MOQ_RULES": "Bridal party bookings: minimum 3 people",
    "BOOKING_RULES": "Slots are 45 min (90 min for color); book at least 2 hours ahead; one stylist per slot",
    "STAFF_DEPARTMENTS": "Hair (Sana, Ayesha), Makeup (Hira), Nails (Mehak)",
    "STAFF_AVAILABILITY": "Confirm with the team; Hira (makeup) is off on Tuesdays",
    "CALL_ROUTING_RULES": "Bridal & complaints → manager; everything else → front desk",
    "WAITLIST_RULES": "If a day is full, offer the next open day and add to waitlist with contact",
    "REMINDER_RULES": "Send a reminder 24h before with date, time, stylist, and location",
    "INTAKE_QUESTIONS": "For color/bridal: current hair length, any prior treatments, desired look",
    "PAYMENT_RULES": "Cash or card on site; bridal needs a 50% deposit; never collect card numbers over chat",
    "STATUS_RULES": "No live order status; capture name + contact and the team follows up",
    "POLICIES": "Late >15 min may shorten the slot; arrive 5 min early",
    "REFUND_RETURN_RULES": "No cash refunds on completed services; redo within 7 days if unhappy — manager decides",
    "CANCELLATION_RULES": "Free cancellation up to 4 hours before; bridal deposit non-refundable",
    "URGENT_HANDLING_RULES": "No emergencies; for anything urgent take details and escalate to the manager",
    "CUSTOMER_DATA_FIELDS": "name, phone, service, preferred date/time, stylist preference, notes",
    "FOLLOW_UP_RULES": "If interested but not booking, offer a callback and capture details",
    "UPSELL_CROSS_SELL_RULES": "Suggest add-ons that fit (e.g. hair treatment with color); never unrelated",
    "SPAM_ABUSE_RULES": "Politely end spam/abuse; do not engage",
    "HUMAN_HANDOFF": "Escalate bridal custom quotes, complaints, refunds, and anything out of scope to the manager",
}


def load_tenant(tenant_id: str) -> dict[str, str]:
    """Return the BUSINESS INFO variable map for a tenant.

    Looks up a real onboarded tenant first (answers compiled into prompt vars);
    falls back to the built-in sample tenant for the demo / unknown ids.
    """
    try:
        from .onboarding.store import build_prompt_vars
        vars_ = build_prompt_vars(tenant_id)
        if vars_:
            return vars_
    except Exception:
        pass
    return dict(SAMPLE_TENANT)
