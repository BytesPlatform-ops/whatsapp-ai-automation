"""Pixie schemas — the single source of truth.

Every backend module imports its data types from here:

    from schemas import Site, Section, SiteMeta, Palette, Request, UsageEvent

Keep this package pure-data: no I/O, no model calls, no framework coupling.
"""

from __future__ import annotations

from .common import (
    CTA,
    Alignment,
    BackgroundStyle,
    CTAStyle,
    ContactInfo,
    MediaAsset,
    MediaKind,
    Palette,
    PaletteMode,
    SectionItem,
    SectionType,
    SocialLink,
    Typography,
    validate_hex_color,
)
from .request import BillingClass, Request, RequestMode
from .site import Section, SectionStyle, Site, SiteMeta
from .usage import ModelTier, UsageEvent, UsageEventType

__all__ = [
    # documents
    "Site",
    "Section",
    "SiteMeta",
    "Palette",
    "Request",
    "UsageEvent",
    # site parts
    "SectionStyle",
    "Typography",
    "SectionItem",
    "MediaAsset",
    "CTA",
    "ContactInfo",
    "SocialLink",
    # request
    "RequestMode",
    "BillingClass",
    # usage
    "UsageEventType",
    "ModelTier",
    # enums / helpers
    "SectionType",
    "Alignment",
    "BackgroundStyle",
    "PaletteMode",
    "MediaKind",
    "CTAStyle",
    "validate_hex_color",
]
