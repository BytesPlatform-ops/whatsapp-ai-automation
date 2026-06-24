"""The 20 seeded industry presets (Section B) as data.

Each preset is the industry's marketing prior: what hurts, what campaigns work,
which formats and platforms fit, the usual offers/objections, and — critically —
the compliance warnings and things to avoid. ``high_risk`` industries (medical,
dental, law, finance, insurance, tax) force human review downstream.

Stored as a module-level dict so it's loaded once and reused. ``get_preset``
always returns a usable preset (falls back to GENERIC), so callers never crash on
an unseeded industry.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from ..schemas import Industry, Platform


class IndustryPreset(BaseModel):
    """Per-industry defaults the Brain reads before reasoning."""

    model_config = ConfigDict(extra="ignore")

    industry: Industry
    display_name: str
    pain_points: list[str] = Field(default_factory=list)
    best_campaign_types: list[str] = Field(default_factory=list)
    content_formats: list[str] = Field(default_factory=list)
    common_offers: list[str] = Field(default_factory=list)
    objection_handling: list[str] = Field(default_factory=list)
    platforms: list[Platform] = Field(default_factory=list)
    content_pillars: list[str] = Field(default_factory=list)
    seasonal_local_ideas: list[str] = Field(default_factory=list)
    lead_magnets: list[str] = Field(default_factory=list)
    cta_examples: list[str] = Field(default_factory=list)
    compliance_warnings: list[str] = Field(default_factory=list)
    things_to_avoid: list[str] = Field(default_factory=list)
    high_risk: bool = Field(default=False, description="Forces human review (medical/legal/financial claims).")


def _p(industry: Industry, display_name: str, **kw) -> IndustryPreset:
    return IndustryPreset(industry=industry, display_name=display_name, **kw)


PRESETS: dict[Industry, IndustryPreset] = {
    Industry.AI_SAAS: _p(
        Industry.AI_SAAS, "AI / SaaS",
        pain_points=["low awareness vs incumbents", "long sales cycles", "explaining a new category", "high churn / weak activation"],
        best_campaign_types=["product launch", "educational", "comparison", "soft launch", "lead gen"],
        content_formats=["explainer reels", "founder posts", "demo videos", "carousels", "threads", "case studies"],
        common_offers=["free trial", "freemium tier", "founding-member pricing", "live demo"],
        objection_handling=["'is it secure?' → show data handling", "'too complex' → 60-sec demo", "'why not build it ourselves' → time-to-value"],
        platforms=[Platform.LINKEDIN, Platform.X, Platform.YOUTUBE_SHORTS, Platform.TIKTOK, Platform.REDDIT],
        content_pillars=["product education", "founder story", "customer wins", "industry POV"],
        seasonal_local_ideas=["end-of-quarter budget pushes", "new-year planning", "product-hunt launch days"],
        lead_magnets=["ROI calculator", "template/checklist", "free audit", "webinar"],
        cta_examples=["Start free", "Book a demo", "See it in action"],
        compliance_warnings=["no fake performance metrics", "don't overstate AI capabilities"],
        things_to_avoid=["jargon walls", "guaranteed-results claims"],
    ),
    Industry.BEAUTY_SALON: _p(
        Industry.BEAUTY_SALON, "Beauty Salon",
        pain_points=["empty mid-week chairs", "no-shows", "seasonal demand swings", "standing out locally"],
        best_campaign_types=["offer", "booking", "seasonal", "referral", "review", "local"],
        content_formats=["before/after reels", "transformation carousels", "stylist stories", "UGC", "stories with booking link"],
        common_offers=["first-visit discount", "bridal package", "refer-a-friend", "off-peak pricing"],
        objection_handling=["'too pricey' → show value/longevity", "'never tried you' → before/afters + reviews"],
        platforms=[Platform.INSTAGRAM, Platform.TIKTOK, Platform.FACEBOOK, Platform.GOOGLE_BUSINESS, Platform.WHATSAPP],
        content_pillars=["transformations", "behind-the-chair", "client love", "offers"],
        seasonal_local_ideas=["bridal season", "festive/holiday glam", "prom season", "summer hair care"],
        lead_magnets=["free consultation", "first-visit voucher", "style quiz"],
        cta_examples=["Book your slot", "DM to reserve", "Claim your first-visit offer"],
        compliance_warnings=["no guaranteed skin/hair outcomes", "real before/afters only (with consent)"],
        things_to_avoid=["stock photos as 'our work'", "unconsented client images"],
    ),
    Industry.DENTAL_CLINIC: _p(
        Industry.DENTAL_CLINIC, "Dental Clinic",
        pain_points=["patient anxiety", "price sensitivity", "trust before first visit", "local competition"],
        best_campaign_types=["trust-building", "booking", "educational", "offer", "review"],
        content_formats=["meet-the-dentist reels", "myth-busting", "patient testimonials (consented)", "FAQ carousels"],
        common_offers=["free consultation", "new-patient exam + clean", "whitening promo", "payment plans"],
        objection_handling=["'it'll hurt' → comfort tech", "'too expensive' → financing", "'no time' → online booking"],
        platforms=[Platform.FACEBOOK, Platform.INSTAGRAM, Platform.GOOGLE_BUSINESS, Platform.YOUTUBE_SHORTS],
        content_pillars=["patient education", "trust & safety", "team", "smiles (consented)"],
        seasonal_local_ideas=["back-to-school checkups", "new-year smile resolutions", "holiday whitening"],
        lead_magnets=["free consult", "checkup voucher", "oral-health guide"],
        cta_examples=["Book a free consult", "Reserve your checkup"],
        compliance_warnings=["no guaranteed outcomes", "no before/after implying treatment results without disclaimers", "follow medical-advertising rules"],
        things_to_avoid=["fear-mongering", "unlicensed medical claims"],
        high_risk=True,
    ),
    Industry.MEDICAL_CLINIC: _p(
        Industry.MEDICAL_CLINIC, "Medical Clinic",
        pain_points=["building trust", "regulatory limits on claims", "appointment no-shows", "patient education"],
        best_campaign_types=["trust-building", "educational", "booking", "awareness"],
        content_formats=["doctor explainers", "preventive-care tips", "patient stories (consented)", "FAQ"],
        common_offers=["free screening", "annual checkup package", "telehealth intro"],
        objection_handling=["'is it credible?' → credentials", "'inconvenient' → telehealth/booking"],
        platforms=[Platform.FACEBOOK, Platform.INSTAGRAM, Platform.GOOGLE_BUSINESS, Platform.YOUTUBE_SHORTS],
        content_pillars=["health education", "preventive care", "credentials & trust", "access"],
        seasonal_local_ideas=["flu season", "wellness new-year", "awareness months"],
        lead_magnets=["free screening", "health checklist", "symptom guide"],
        cta_examples=["Book an appointment", "Talk to a doctor"],
        compliance_warnings=["NO medical guarantees or cure claims", "respect patient privacy/HIPAA-equivalent", "evidence-based only"],
        things_to_avoid=["diagnosing in content", "fear-based marketing", "unproven treatments"],
        high_risk=True,
    ),
    Industry.REAL_ESTATE: _p(
        Industry.REAL_ESTATE, "Real Estate",
        pain_points=["lead quality", "long decision cycles", "market trust", "standing out among agents"],
        best_campaign_types=["lead gen", "local", "educational", "trust-building", "retargeting"],
        content_formats=["property tour reels", "neighborhood guides", "market-update posts", "agent story", "carousels"],
        common_offers=["free home valuation", "buyer/seller guide", "first-time-buyer consult"],
        objection_handling=["'is now a good time?' → data", "'why this agent' → track record"],
        platforms=[Platform.INSTAGRAM, Platform.FACEBOOK, Platform.YOUTUBE_SHORTS, Platform.LINKEDIN, Platform.TIKTOK],
        content_pillars=["listings", "local market", "buyer/seller education", "agent credibility"],
        seasonal_local_ideas=["spring buying season", "year-end tax moves", "local development news"],
        lead_magnets=["free valuation", "buyer's guide", "neighborhood report"],
        cta_examples=["Get your free valuation", "Book a viewing", "DM for the full tour"],
        compliance_warnings=["fair-housing compliance — no discriminatory targeting", "no guaranteed-return investment claims"],
        things_to_avoid=["discriminatory audience targeting", "unrealistic ROI promises"],
        high_risk=True,
    ),
    Industry.RESTAURANT_CAFE: _p(
        Industry.RESTAURANT_CAFE, "Restaurant / Cafe",
        pain_points=["filling slow shifts", "thin margins", "repeat visits", "local discovery"],
        best_campaign_types=["offer", "local", "seasonal", "UGC", "review", "event"],
        content_formats=["food reels", "behind-the-kitchen", "menu drops", "UGC reposts", "stories"],
        common_offers=["lunch special", "happy hour", "loyalty card", "new-dish launch"],
        objection_handling=["'never heard of it' → reviews + UGC", "'too far' → delivery/highlight ambience"],
        platforms=[Platform.INSTAGRAM, Platform.TIKTOK, Platform.FACEBOOK, Platform.GOOGLE_BUSINESS],
        content_pillars=["the food", "the vibe", "the people", "offers"],
        seasonal_local_ideas=["festive menus", "summer patio", "local events tie-ins", "weekend brunch"],
        lead_magnets=["first-order discount", "loyalty signup", "reservation link"],
        cta_examples=["Reserve a table", "Order now", "Tag a friend you'd bring"],
        compliance_warnings=["accurate allergen/ingredient info", "honest pricing"],
        things_to_avoid=["misleading portion/look", "fake scarcity"],
    ),
    Industry.FITNESS_GYM: _p(
        Industry.FITNESS_GYM, "Fitness / Gym",
        pain_points=["seasonal signups then churn", "intimidation factor", "retention", "local competition"],
        best_campaign_types=["offer", "challenge/event", "re-engagement", "referral", "trust-building"],
        content_formats=["transformation reels (consented)", "trainer tips", "member stories", "challenge promos"],
        common_offers=["free trial week", "new-year challenge", "bring-a-friend", "no-joining-fee"],
        objection_handling=["'intimidated' → welcoming community", "'no time' → short workouts", "'too pricey' → value/results"],
        platforms=[Platform.INSTAGRAM, Platform.TIKTOK, Platform.FACEBOOK, Platform.YOUTUBE_SHORTS],
        content_pillars=["results", "coaching", "community", "offers"],
        seasonal_local_ideas=["new-year resolutions", "summer-shred", "back-to-routine autumn"],
        lead_magnets=["free trial pass", "workout plan PDF", "free assessment"],
        cta_examples=["Claim your free week", "Start the challenge", "DM to book a tour"],
        compliance_warnings=["no guaranteed weight-loss claims", "real transformations only with consent"],
        things_to_avoid=["body-shaming", "miracle-result promises"],
    ),
    Industry.ECOMMERCE: _p(
        Industry.ECOMMERCE, "Ecommerce",
        pain_points=["cart abandonment", "ad-cost pressure", "differentiation", "repeat purchase"],
        best_campaign_types=["product launch", "offer", "retargeting", "UGC", "seasonal", "giveaway"],
        content_formats=["product reels", "UGC", "unboxings", "comparison", "carousels", "email flows"],
        common_offers=["launch discount", "bundle deal", "free shipping threshold", "first-order code"],
        objection_handling=["'will it fit/work' → reviews/UGC", "'shipping?' → clear policy", "'trust?' → social proof"],
        platforms=[Platform.INSTAGRAM, Platform.TIKTOK, Platform.FACEBOOK, Platform.PINTEREST, Platform.EMAIL],
        content_pillars=["product hero", "social proof", "lifestyle", "offers"],
        seasonal_local_ideas=["BFCM", "holiday gifting", "back-to-school", "seasonal collections"],
        lead_magnets=["first-order discount", "size/style quiz", "early-access list"],
        cta_examples=["Shop now", "Get the bundle", "Claim your code"],
        compliance_warnings=["honest pricing & 'sale' framing", "no fake reviews", "accurate product claims"],
        things_to_avoid=["fake countdown timers", "deceptive discounts"],
    ),
    Industry.AUTO_REPAIR: _p(
        Industry.AUTO_REPAIR, "Auto Repair",
        pain_points=["trust (overcharging fear)", "emergency timing", "local competition", "repeat business"],
        best_campaign_types=["trust-building", "local", "offer", "booking", "review"],
        content_formats=["explainer reels", "before/after repairs", "mechanic tips", "testimonials"],
        common_offers=["free inspection", "seasonal checkup", "first-service discount"],
        objection_handling=["'will I be overcharged' → transparent quotes", "'how long' → fast turnaround"],
        platforms=[Platform.FACEBOOK, Platform.GOOGLE_BUSINESS, Platform.INSTAGRAM, Platform.TIKTOK],
        content_pillars=["transparency", "expertise", "fast service", "trust"],
        seasonal_local_ideas=["winter/summer car prep", "road-trip checks", "MOT/inspection season"],
        lead_magnets=["free inspection", "maintenance checklist", "seasonal discount"],
        cta_examples=["Book an inspection", "Get a free quote", "Call now"],
        compliance_warnings=["honest quotes", "no unnecessary-work upsell framing"],
        things_to_avoid=["scare tactics", "hidden fees"],
    ),
    Industry.CLEANING_SERVICE: _p(
        Industry.CLEANING_SERVICE, "Cleaning Service",
        pain_points=["trust (home access)", "one-off vs recurring", "local discovery", "pricing transparency"],
        best_campaign_types=["offer", "local", "referral", "booking", "trust-building"],
        content_formats=["satisfying before/after reels", "team intro", "checklist carousels", "reviews"],
        common_offers=["first-clean discount", "recurring-plan deal", "refer-a-friend"],
        objection_handling=["'can I trust them in my home' → vetted/insured", "'pricing?' → clear quotes"],
        platforms=[Platform.FACEBOOK, Platform.INSTAGRAM, Platform.NEXTDOOR, Platform.GOOGLE_BUSINESS, Platform.TIKTOK],
        content_pillars=["before/after", "trust & vetting", "convenience", "offers"],
        seasonal_local_ideas=["spring cleaning", "post-holiday", "move-in/move-out season"],
        lead_magnets=["first-clean discount", "free quote", "cleaning checklist"],
        cta_examples=["Get a free quote", "Book your first clean", "Message us"],
        compliance_warnings=["honest pricing", "insured/vetted claims must be true"],
        things_to_avoid=["unverifiable guarantees", "fake reviews"],
    ),
    Industry.HOME_SERVICES: _p(
        Industry.HOME_SERVICES, "Home Services (plumbing/HVAC/electrical)",
        pain_points=["emergency timing", "trust & licensing", "price transparency", "local competition"],
        best_campaign_types=["local", "trust-building", "offer", "booking", "review"],
        content_formats=["job-site reels", "explainer tips", "before/after", "testimonials"],
        common_offers=["free callout", "seasonal tune-up", "first-job discount", "24/7 emergency"],
        objection_handling=["'reliable?' → licensed/insured + reviews", "'cost?' → upfront pricing"],
        platforms=[Platform.GOOGLE_BUSINESS, Platform.FACEBOOK, Platform.NEXTDOOR, Platform.INSTAGRAM, Platform.TIKTOK],
        content_pillars=["expertise", "fast response", "transparency", "trust"],
        seasonal_local_ideas=["winter heating", "summer AC", "storm prep"],
        lead_magnets=["free quote", "maintenance checklist", "seasonal tune-up"],
        cta_examples=["Call now", "Book a callout", "Get a free quote"],
        compliance_warnings=["licensing claims must be accurate", "honest pricing"],
        things_to_avoid=["scare tactics", "hidden fees"],
    ),
    Industry.LAW_FIRM: _p(
        Industry.LAW_FIRM, "Law Firm",
        pain_points=["trust & credibility", "sensitive topics", "ad regulation", "lead quality"],
        best_campaign_types=["trust-building", "educational", "lead gen", "local"],
        content_formats=["know-your-rights explainers", "FAQ carousels", "case-result context (compliant)", "attorney intro"],
        common_offers=["free consultation", "case evaluation"],
        objection_handling=["'expensive?' → consult + fee structure", "'will they win' → never promise outcomes"],
        platforms=[Platform.LINKEDIN, Platform.FACEBOOK, Platform.GOOGLE_BUSINESS, Platform.YOUTUBE_SHORTS],
        content_pillars=["education", "credibility", "process clarity", "approachability"],
        seasonal_local_ideas=["tax-season (for relevant practice)", "new-law explainers", "local awareness"],
        lead_magnets=["free consultation", "legal guide", "rights checklist"],
        cta_examples=["Book a free consultation", "Request a case evaluation"],
        compliance_warnings=["NO guaranteed outcomes", "follow bar advertising rules", "no misleading testimonials"],
        things_to_avoid=["outcome guarantees", "fear-based tactics", "confidential details"],
        high_risk=True,
    ),
    Industry.ACCOUNTING_TAX: _p(
        Industry.ACCOUNTING_TAX, "Accounting / Tax",
        pain_points=["seasonal demand", "trust with finances", "differentiation", "explaining value"],
        best_campaign_types=["educational", "seasonal", "trust-building", "lead gen"],
        content_formats=["tip reels", "deadline reminders", "myth-busting", "FAQ carousels"],
        common_offers=["free consultation", "tax-season package", "first-month bookkeeping"],
        objection_handling=["'DIY is fine' → time/risk saved", "'trust?' → credentials + reviews"],
        platforms=[Platform.LINKEDIN, Platform.FACEBOOK, Platform.INSTAGRAM, Platform.GOOGLE_BUSINESS],
        content_pillars=["education", "deadlines & savings", "credibility", "process"],
        seasonal_local_ideas=["tax season", "year-end planning", "quarterly deadlines"],
        lead_magnets=["free consult", "deduction checklist", "tax-deadline calendar"],
        cta_examples=["Book a free consult", "Get your tax checklist"],
        compliance_warnings=["NO guaranteed-refund claims", "accurate financial guidance only"],
        things_to_avoid=["promising specific savings", "misleading tax advice"],
        high_risk=True,
    ),
    Industry.SCHOOL_ACADEMY: _p(
        Industry.SCHOOL_ACADEMY, "School / Academy",
        pain_points=["enrollment cycles", "parent trust", "differentiation", "showing outcomes"],
        best_campaign_types=["enrollment (lead gen)", "trust-building", "educational", "event", "seasonal"],
        content_formats=["student-life reels", "teacher intros", "parent testimonials", "open-day promos"],
        common_offers=["free trial class", "open day", "early-enrollment discount"],
        objection_handling=["'is it worth it' → outcomes", "'right fit?' → trial class/open day"],
        platforms=[Platform.FACEBOOK, Platform.INSTAGRAM, Platform.YOUTUBE_SHORTS, Platform.WHATSAPP],
        content_pillars=["student outcomes", "teaching quality", "community", "enrollment"],
        seasonal_local_ideas=["admission season", "exam prep", "summer programs", "back-to-school"],
        lead_magnets=["free trial class", "open-day signup", "curriculum guide"],
        cta_examples=["Book a free trial class", "Register for open day"],
        compliance_warnings=["honest outcome claims", "child-image consent required"],
        things_to_avoid=["guaranteed-grade claims", "unconsented student images"],
    ),
    Industry.EVENT_PLANNER: _p(
        Industry.EVENT_PLANNER, "Event Planner",
        pain_points=["showing range/quality", "trust for big-ticket spend", "seasonality", "referrals"],
        best_campaign_types=["UGC/portfolio", "trust-building", "lead gen", "seasonal", "referral"],
        content_formats=["event highlight reels", "behind-the-scenes", "client testimonials", "mood-board carousels"],
        common_offers=["free consultation", "package deals", "early-booking discount"],
        objection_handling=["'can they deliver' → portfolio + reviews", "'budget?' → tiered packages"],
        platforms=[Platform.INSTAGRAM, Platform.PINTEREST, Platform.TIKTOK, Platform.FACEBOOK],
        content_pillars=["portfolio", "process", "client love", "inspiration"],
        seasonal_local_ideas=["wedding season", "festive parties", "corporate year-end", "graduation"],
        lead_magnets=["free consult", "planning checklist", "budget guide"],
        cta_examples=["Book a consultation", "DM to plan your event"],
        compliance_warnings=["use only consented client event footage", "honest pricing"],
        things_to_avoid=["misrepresenting others' work as yours"],
    ),
    Industry.TRAVEL_AGENCY: _p(
        Industry.TRAVEL_AGENCY, "Travel Agency",
        pain_points=["DIY booking competition", "trust for big spend", "seasonality", "differentiation"],
        best_campaign_types=["offer", "seasonal", "UGC", "lead gen", "educational"],
        content_formats=["destination reels", "deal posts", "traveler UGC", "itinerary carousels"],
        common_offers=["early-bird deal", "package discount", "free itinerary consult"],
        objection_handling=["'why not book myself' → value/hassle saved", "'trust?' → reviews + protection"],
        platforms=[Platform.INSTAGRAM, Platform.TIKTOK, Platform.FACEBOOK, Platform.PINTEREST],
        content_pillars=["destinations", "deals", "traveler stories", "expertise"],
        seasonal_local_ideas=["summer holidays", "winter escapes", "festive travel", "honeymoon season"],
        lead_magnets=["free itinerary consult", "destination guide", "deal alerts list"],
        cta_examples=["Get your free itinerary", "DM for the deal"],
        compliance_warnings=["accurate pricing incl. fees", "honest availability"],
        things_to_avoid=["hidden fees", "fake scarcity"],
    ),
    Industry.HOTEL: _p(
        Industry.HOTEL, "Hotel",
        pain_points=["OTA dependence", "off-season occupancy", "direct-booking share", "differentiation"],
        best_campaign_types=["offer", "seasonal", "UGC", "local", "retargeting"],
        content_formats=["room/property reels", "guest UGC", "local-experience posts", "offer stories"],
        common_offers=["direct-booking discount", "seasonal package", "stay-longer deal"],
        objection_handling=["'why book direct' → perks", "'worth it?' → reviews + experience"],
        platforms=[Platform.INSTAGRAM, Platform.FACEBOOK, Platform.TIKTOK, Platform.GOOGLE_BUSINESS, Platform.PINTEREST],
        content_pillars=["the property", "guest experience", "local area", "offers"],
        seasonal_local_ideas=["holiday packages", "off-season deals", "local events/festivals"],
        lead_magnets=["direct-booking discount", "best-rate guarantee", "newsletter perks"],
        cta_examples=["Book direct & save", "Reserve your stay"],
        compliance_warnings=["accurate amenity claims", "honest rate framing"],
        things_to_avoid=["misleading photos", "hidden resort fees"],
    ),
    Industry.CONSTRUCTION: _p(
        Industry.CONSTRUCTION, "Construction",
        pain_points=["trust for big projects", "long sales cycle", "showing quality", "lead quality"],
        best_campaign_types=["portfolio/UGC", "trust-building", "lead gen", "local"],
        content_formats=["project time-lapse reels", "before/after", "process explainers", "client testimonials"],
        common_offers=["free quote", "free site consultation", "design consult"],
        objection_handling=["'reliable & on-budget?' → track record", "'licensed?' → credentials"],
        platforms=[Platform.FACEBOOK, Platform.INSTAGRAM, Platform.LINKEDIN, Platform.YOUTUBE_SHORTS, Platform.GOOGLE_BUSINESS],
        content_pillars=["completed projects", "process & quality", "team & trust", "expertise"],
        seasonal_local_ideas=["building-season push", "winter-prep projects", "local development tie-ins"],
        lead_magnets=["free quote", "project planning guide", "free consult"],
        cta_examples=["Get a free quote", "Book a site visit"],
        compliance_warnings=["licensing/insurance claims must be true", "honest timelines & pricing"],
        things_to_avoid=["misrepresenting others' projects", "unrealistic timelines"],
    ),
    Industry.MARKETING_AGENCY: _p(
        Industry.MARKETING_AGENCY, "Marketing Agency",
        pain_points=["crowded market", "proving ROI", "trust", "differentiation"],
        best_campaign_types=["thought leadership", "case-study/lead gen", "educational", "comparison"],
        content_formats=["case-study carousels", "founder POV", "tip reels", "client-result posts (compliant)"],
        common_offers=["free audit", "strategy call", "trial project"],
        objection_handling=["'do they get results' → case studies", "'why this agency' → niche + process"],
        platforms=[Platform.LINKEDIN, Platform.INSTAGRAM, Platform.X, Platform.TIKTOK, Platform.YOUTUBE_SHORTS],
        content_pillars=["results & proof", "expertise/POV", "process", "team"],
        seasonal_local_ideas=["new-year planning", "end-of-quarter budgets", "industry events"],
        lead_magnets=["free audit", "strategy call", "playbook/template"],
        cta_examples=["Book a free audit", "Get a strategy call"],
        compliance_warnings=["no fabricated results", "client data only with consent"],
        things_to_avoid=["guaranteed-virality claims", "vanity-metric promises"],
    ),
    Industry.INSURANCE: _p(
        Industry.INSURANCE, "Insurance",
        pain_points=["trust", "complexity/jargon", "regulated claims", "differentiation"],
        best_campaign_types=["educational", "trust-building", "lead gen", "local"],
        content_formats=["explainer reels", "myth-busting", "FAQ carousels", "agent intro"],
        common_offers=["free quote", "policy review", "consultation"],
        objection_handling=["'too complex' → plain-language explainers", "'best price?' → personalized quote"],
        platforms=[Platform.FACEBOOK, Platform.LINKEDIN, Platform.INSTAGRAM, Platform.GOOGLE_BUSINESS],
        content_pillars=["education", "trust & credentials", "real scenarios", "access"],
        seasonal_local_ideas=["open-enrollment", "new-year coverage review", "life-event triggers"],
        lead_magnets=["free quote", "coverage checklist", "policy-review offer"],
        cta_examples=["Get a free quote", "Book a policy review"],
        compliance_warnings=["follow insurance-advertising regulation", "no misleading coverage/guarantee claims", "no sensitive-data targeting"],
        things_to_avoid=["fear-based selling", "overstating coverage"],
        high_risk=True,
    ),
    Industry.GENERIC: _p(
        Industry.GENERIC, "Generic Business",
        pain_points=["low local awareness", "inconsistent leads", "standing out", "repeat business"],
        best_campaign_types=["brand awareness", "offer", "lead gen", "local", "trust-building"],
        content_formats=["short-form reels", "carousels", "testimonials", "behind-the-scenes", "offer posts"],
        common_offers=["intro discount", "free consultation", "referral reward"],
        objection_handling=["'never heard of you' → social proof", "'why you' → clear USP"],
        platforms=[Platform.INSTAGRAM, Platform.FACEBOOK, Platform.TIKTOK, Platform.GOOGLE_BUSINESS],
        content_pillars=["who we are", "what we offer", "social proof", "offers"],
        seasonal_local_ideas=["holiday promos", "local events", "seasonal offers"],
        lead_magnets=["intro discount", "free consult", "useful checklist"],
        cta_examples=["Message us", "Book now", "Learn more"],
        compliance_warnings=["honest claims only", "real reviews only"],
        things_to_avoid=["misleading claims", "fake urgency"],
    ),
}


def get_preset(industry: Industry | str) -> IndustryPreset:
    """Return the preset for an industry, falling back to GENERIC. Accepts the
    enum or its string value so callers never have to coerce first."""
    if isinstance(industry, str):
        try:
            industry = Industry(industry)
        except ValueError:
            return PRESETS[Industry.GENERIC]
    return PRESETS.get(industry, PRESETS[Industry.GENERIC])


def list_presets() -> list[IndustryPreset]:
    """All seeded presets (handy for the dashboard's Industry Presets screen)."""
    return list(PRESETS.values())
