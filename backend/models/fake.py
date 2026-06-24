"""FakeProvider — a deterministic stand-in for a real LLM (fake mode).

It returns provider-shaped completions so the WHOLE pipe runs end-to-end with no
API key/spend: for `build` it emits the agent OUTPUT FORMAT JSON ({reply, site,
assumptions, usage_note}) where `site` matches schemas.Site; for `firewall` a
classification JSON; for `edit` it echoes the site (real Editor lands later).

The hand-authored "brand kits" live here (not in generation/) because they are
the fake MODEL's canned knowledge — generation/ just builds the prompt + parses
the response, exactly as it will with a real model.
"""

from __future__ import annotations

import json
import re
from time import perf_counter

from schemas import (
    CTA,
    MediaAsset,
    Palette,
    Section,
    SectionItem,
    SectionType,
    Site,
    SiteMeta,
    Typography,
)
from schemas.common import Alignment, BackgroundStyle, CTAStyle
from schemas.site import SectionStyle

from .base import ModelRequest, ModelResult, Provider, estimate_tokens

_RESTAURANT = ("restaurant", "cafe", "café", "bistro", "trattoria", "diner", "pizz", "kitchen", "eatery", "coffee")
_PLUMBER = ("plumb", "hvac", "electric", "roofing", "handyman", "boiler", "drain")


def _detect_kind(message: str) -> str:
    m = message.lower()
    if any(k in m for k in _RESTAURANT):
        return "restaurant"
    if any(k in m for k in _PLUMBER):
        return "trades"
    return "generic"


def _guess_brand_name(message: str, kind: str) -> str:
    m = re.search(r"\b(?:called|named|for)\s+([A-Z][\w&'’]+(?:\s+[A-Z][\w&'’]+){0,2})", message)
    if m:
        return m.group(1).strip()
    return {"restaurant": "Trattoria Lucia", "trades": "RapidFlow Plumbing"}.get(kind, "Northstar Studio")


def _build_kit(message: str, tenant_id: str) -> Site:
    kind = _detect_kind(message)
    brand = _guess_brand_name(message, kind)
    if kind == "restaurant":
        return _restaurant_site(tenant_id, brand)
    if kind == "trades":
        return _trades_site(tenant_id, brand)
    return _generic_site(tenant_id, brand)


def _restaurant_site(tenant_id: str, brand: str) -> Site:
    return Site(
        tenant_id=tenant_id,
        meta=SiteMeta(brand_name=brand, business_type="neighbourhood italian restaurant",
                      tagline="Hand-rolled pasta, poured-over welcome.", voice="warm, family-run, unpretentious",
                      seo_title=f"{brand} — Hand-made pasta & wood-fired plates",
                      seo_description="Seasonal Italian cooking, natural wines, and a table that feels like home.",
                      keywords=["italian restaurant", "fresh pasta", "reservations"]),
        palette=Palette(name="Warm Terracotta", primary="#C24E2A", secondary="#7A8450", accent="#E8B04B",
                        background="#FBF6EF", surface="#FFFFFF", text="#2B1B14", muted="#6B5848"),
        typography=Typography(heading_font="Fraunces", body_font="Inter"),
        sections=[
            Section(type=SectionType.HERO, order=0, eyebrow="Since 1998", heading=f"A table at {brand}",
                    subheading="Slow food, fast welcome — five minutes from the square.",
                    media=[MediaAsset(description="Warm dim-lit dining room, steam off fresh pasta")],
                    ctas=[CTA(label="Reserve a table", href="/reserve", style=CTAStyle.PRIMARY),
                          CTA(label="See the menu", href="#menu", style=CTAStyle.SECONDARY)],
                    style=SectionStyle(alignment=Alignment.LEFT, background=BackgroundStyle.IMAGE, full_width=True, variant="split-left")),
            Section(type=SectionType.MENU, order=1, heading="Tonight's plates",
                    items=[SectionItem(title="Cacio e Pepe", description="Tonnarelli, pecorino, cracked pepper", price="$18"),
                           SectionItem(title="Wood-fired Margherita", description="San Marzano, fior di latte, basil", price="$16"),
                           SectionItem(title="Tiramisù", description="Made this morning", price="$9")],
                    style=SectionStyle(alignment=Alignment.LEFT, background=BackgroundStyle.MUTED, variant="menu-rows")),
            Section(type=SectionType.RESERVATIONS, order=2, heading="Book your table",
                    body="Walk-ins welcome, but weekends fill fast.", ctas=[CTA(label="Reserve now", href="/reserve")],
                    style=SectionStyle(alignment=Alignment.CENTER, background=BackgroundStyle.DARK, variant="banner")),
        ],
    )


def _trades_site(tenant_id: str, brand: str) -> Site:
    return Site(
        tenant_id=tenant_id,
        meta=SiteMeta(brand_name=brand, business_type="emergency plumbing & heating",
                      tagline="Leak today? We're there today.", voice="reassuring, fast, no jargon",
                      seo_title=f"{brand} — 24/7 Emergency Plumber",
                      seo_description="Licensed local plumbers, upfront pricing, same-day callouts.",
                      keywords=["emergency plumber", "boiler repair", "same day"]),
        palette=Palette(name="Trust Slate", primary="#1F6FB2", secondary="#0E2A3B", accent="#F4A024",
                        background="#0E1A24", surface="#16242F", text="#EAF2F8", muted="#9DB4C4", mode="dark"),
        typography=Typography(heading_font="Sora", body_font="Inter"),
        sections=[
            Section(type=SectionType.HERO, order=0, eyebrow="24/7 callout", heading="Leak today? We're there today.",
                    subheading="Licensed local plumbers — upfront pricing, no surprises.",
                    ctas=[CTA(label="Call now", href="tel:+10000000000", style=CTAStyle.PRIMARY),
                          CTA(label="Book online", href="/book", style=CTAStyle.SECONDARY)],
                    style=SectionStyle(alignment=Alignment.LEFT, background=BackgroundStyle.DARK, full_width=True, variant="split-right")),
            Section(type=SectionType.SERVICES, order=1, heading="What we fix",
                    items=[SectionItem(title="Burst pipes & leaks", icon="droplet"),
                           SectionItem(title="Boiler repair & service", icon="flame"),
                           SectionItem(title="Blocked drains", icon="waves")],
                    style=SectionStyle(alignment=Alignment.LEFT, background=BackgroundStyle.SOLID, variant="cards-3")),
            Section(type=SectionType.TESTIMONIALS, order=2, heading="Neighbours trust us",
                    items=[SectionItem(title='"Here within the hour."', subtitle="Priya, Didsbury")],
                    style=SectionStyle(alignment=Alignment.CENTER, background=BackgroundStyle.ACCENT, variant="quote")),
            Section(type=SectionType.CTA, order=3, heading="Got a plumbing emergency?",
                    ctas=[CTA(label="Call now", href="tel:+10000000000")],
                    style=SectionStyle(alignment=Alignment.CENTER, background=BackgroundStyle.GRADIENT, variant="banner")),
        ],
    )


def _generic_site(tenant_id: str, brand: str) -> Site:
    return Site(
        tenant_id=tenant_id,
        meta=SiteMeta(brand_name=brand, business_type="independent studio", tagline="Small team, sharp work.",
                      voice="confident, plain-spoken", seo_title=f"{brand} — Independent studio",
                      seo_description="We design and build digital products for ambitious teams."),
        palette=Palette(name="Ink & Lime", primary="#10211B", secondary="#1E3A2F", accent="#9AE66E",
                        background="#0B1410", surface="#11201A", text="#EAF3EC", muted="#8FA89A", mode="dark"),
        typography=Typography(heading_font="Clash Display", body_font="Inter"),
        sections=[
            Section(type=SectionType.HERO, order=0, eyebrow="Studio", heading="Small team, sharp work.",
                    subheading="We design and build digital products that earn their keep.",
                    ctas=[CTA(label="Start a project", href="/contact", style=CTAStyle.PRIMARY)],
                    style=SectionStyle(alignment=Alignment.LEFT, background=BackgroundStyle.DARK, full_width=True, variant="centered-bold")),
            Section(type=SectionType.FEATURES, order=1, heading="What we do",
                    items=[SectionItem(title="Product design", description="From idea to interface."),
                           SectionItem(title="Engineering", description="Shipped, not slideware."),
                           SectionItem(title="Brand", description="A voice people remember.")],
                    style=SectionStyle(alignment=Alignment.LEFT, background=BackgroundStyle.SOLID, variant="cards-3")),
            Section(type=SectionType.CTA, order=2, heading="Have something in mind?",
                    ctas=[CTA(label="Tell us about it", href="/contact")],
                    style=SectionStyle(alignment=Alignment.CENTER, background=BackgroundStyle.GRADIENT, variant="banner")),
        ],
    )


class FakeProvider:
    """Deterministic provider for local dev + tests. Implements `Provider`."""

    name = "fake"

    async def complete(self, req: ModelRequest, *, model: str) -> ModelResult:
        t0 = perf_counter()

        if req.task == "build":
            site = _build_kit(req.user, req.context.get("tenant_id", ""))
            payload = {
                "reply": f"Built a {site.meta.business_type} site for {site.meta.brand_name}.",
                "site": site.model_dump(mode="json"),
                "assumptions": ["Picked palette + sections from the business type."],
                "usage_note": "large tier recommended for full builds",
            }
        elif req.task == "edit":
            # Real Editor is a later step; for now echo the provided site unchanged.
            payload = {"reply": "Applied your change.", "site": req.context.get("site", {}), "assumptions": []}
        elif req.task in ("firewall", "classify"):
            payload = {"in_scope": True, "safe": True, "billing_class": "standard", "reason": "fake: allow"}
        else:
            payload = {}

        text = json.dumps(payload)
        latency_ms = int((perf_counter() - t0) * 1000)
        return ModelResult(
            text=text,
            model=model,
            tier=req.tier,
            tokens_in=estimate_tokens(req.system + req.user),
            tokens_out=estimate_tokens(text),
            latency_ms=latency_ms,
            cost_usd=0.0,  # router fills real cost via pricing
        )


# Assert the duck-typed protocol holds.
_: Provider = FakeProvider()
