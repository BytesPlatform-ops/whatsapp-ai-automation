"""Shared enums and value objects used across Pixie schemas.

These are the small, reusable building blocks. The top-level documents
(`Site`, `Request`, `UsageEvent`) live in their own modules and compose these.
Everything here is provider-agnostic plain data — no I/O, no model calls.
"""

from __future__ import annotations

import re
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator

# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #


class SectionType(str, Enum):
    """The kind of section. Drives layout + what the quality gate expects.

    Business-type-specific sections (MENU, RESERVATIONS, HOURS) exist so the
    Builder can adapt: restaurant → MENU/RESERVATIONS, plumber → SERVICES/CTA.
    """

    NAV = "nav"
    HERO = "hero"
    ABOUT = "about"
    SERVICES = "services"
    FEATURES = "features"
    MENU = "menu"  # restaurants / cafes
    GALLERY = "gallery"
    TESTIMONIALS = "testimonials"
    PRICING = "pricing"
    FAQ = "faq"
    TEAM = "team"
    STATS = "stats"
    PROCESS = "process"  # "how it works"
    LOGO_CLOUD = "logo_cloud"
    HOURS = "hours"  # business hours
    RESERVATIONS = "reservations"
    CONTACT = "contact"
    MAP = "map"
    NEWSLETTER = "newsletter"
    CTA = "cta"
    FOOTER = "footer"
    CUSTOM = "custom"


class Alignment(str, Enum):
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"


class BackgroundStyle(str, Enum):
    """How a section's background reads — used by the quality gate to detect
    monotony (e.g. every section SOLID + light = templated)."""

    SOLID = "solid"
    MUTED = "muted"
    GRADIENT = "gradient"
    IMAGE = "image"
    DARK = "dark"
    ACCENT = "accent"


class PaletteMode(str, Enum):
    LIGHT = "light"
    DARK = "dark"


class MediaKind(str, Enum):
    IMAGE = "image"
    VIDEO = "video"
    ICON = "icon"


class CTAStyle(str, Enum):
    PRIMARY = "primary"
    SECONDARY = "secondary"
    LINK = "link"


# --------------------------------------------------------------------------- #
# Value objects
# --------------------------------------------------------------------------- #

_HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


class CTA(BaseModel):
    """A call-to-action button or link."""

    model_config = ConfigDict(extra="ignore")

    label: str = Field(..., min_length=1, max_length=60, description="Button text — benefit-led, never 'Click here'.")
    href: str = Field(default="#", description="Target URL or anchor.")
    style: CTAStyle = CTAStyle.PRIMARY
    icon: str | None = Field(default=None, description="Optional icon name (lucide).")


class MediaAsset(BaseModel):
    """An image/video/icon slot.

    During generation the asset may have only a `description` (an image brief)
    and no `url` yet — image sourcing happens downstream. `alt` is required for
    accessibility once an image is real.
    """

    model_config = ConfigDict(extra="ignore")

    kind: MediaKind = MediaKind.IMAGE
    url: str | None = None
    description: str | None = Field(default=None, description="Image brief if no URL yet (what the picture should show).")
    alt: str | None = Field(default=None, max_length=200)
    caption: str | None = Field(default=None, max_length=200)


class SectionItem(BaseModel):
    """A repeated unit inside a section: a service, menu item, testimonial,
    pricing tier, FAQ entry, team member, stat, etc. Generic on purpose; the
    `data` escape hatch carries type-specific extras without schema churn."""

    model_config = ConfigDict(extra="ignore")

    id: str | None = None
    title: str | None = Field(default=None, max_length=160)
    subtitle: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=1200)
    icon: str | None = None
    media: MediaAsset | None = None
    price: str | None = Field(default=None, description="Display price, e.g. '$12' or 'From £49/mo'.")
    badge: str | None = Field(default=None, max_length=40, description="e.g. 'Most popular'.")
    cta: CTA | None = None
    data: dict[str, object] = Field(default_factory=dict, description="Type-specific extras (e.g. faq answer, menu allergens).")


class Typography(BaseModel):
    """Font pairing. Intentional pairing is part of looking bespoke."""

    model_config = ConfigDict(extra="ignore")

    heading_font: str = Field(..., description="Display/heading typeface family.")
    body_font: str = Field(..., description="Body typeface family.")
    base_size_px: int = Field(default=16, ge=12, le=22)


class ContactInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    phone: str | None = None
    email: str | None = None
    address: str | None = None
    map_url: str | None = None
    hours: dict[str, str] = Field(default_factory=dict, description="e.g. {'Mon-Fri': '9-5'}.")


class SocialLink(BaseModel):
    model_config = ConfigDict(extra="ignore")

    platform: str = Field(..., description="instagram / facebook / x / linkedin / tiktok …")
    url: str


def validate_hex_color(value: str) -> str:
    """Reusable hex-color validator (#RGB / #RRGGBB / #RRGGBBAA)."""
    if not _HEX_RE.match(value):
        raise ValueError(f"'{value}' is not a valid hex color (expected #RGB, #RRGGBB or #RRGGBBAA)")
    return value.lower()


class Palette(BaseModel):
    """Intentional brand palette.

    `default_blue` flags are intentionally NOT here — the quality gate inspects
    the actual hex values to detect the lazy default-blue/centered template.
    """

    model_config = ConfigDict(extra="ignore")

    name: str | None = Field(default=None, description="Human label, e.g. 'Warm Terracotta'.")
    mode: PaletteMode = PaletteMode.LIGHT
    primary: str = Field(..., description="Brand/primary color (hex).")
    secondary: str | None = None
    accent: str | None = None
    background: str = Field(default="#ffffff")
    surface: str | None = Field(default=None, description="Card/elevated surface color.")
    text: str = Field(default="#0f172a")
    muted: str | None = Field(default=None, description="Muted/secondary text color.")

    @field_validator("primary", "secondary", "accent", "background", "surface", "text", "muted")
    @classmethod
    def _validate_colors(cls, v: str | None) -> str | None:
        return None if v is None else validate_hex_color(v)
