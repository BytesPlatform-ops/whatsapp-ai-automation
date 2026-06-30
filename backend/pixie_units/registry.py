"""Canonical Pixie unit registry (agents + Omni) and slug normalization.

`backend_key` uses the REAL entitlement keys (receptionist/website/seo/marketing/
content) so it matches the existing entitlements + feed services.
"""

from __future__ import annotations

AGENTS = {
    "ai-receptionist": {"type": "agent", "slug": "ai-receptionist", "backend_key": "receptionist", "name": "AI Receptionist", "dashboard_path": "/app/agents/ai-receptionist", "full_service_path": "/app/agents/ai-receptionist/full-service", "trial_enabled": True},
    "website-builder": {"type": "agent", "slug": "website-builder", "backend_key": "website", "name": "Website Builder", "dashboard_path": "/app/agents/website-builder", "full_service_path": "/app/agents/website-builder/full-service", "trial_enabled": True},
    "seo-agent": {"type": "agent", "slug": "seo-agent", "backend_key": "seo", "name": "SEO Agent", "dashboard_path": "/app/agents/seo-agent", "full_service_path": "/app/agents/seo-agent/full-service", "trial_enabled": True},
    "marketing-agent": {"type": "agent", "slug": "marketing-agent", "backend_key": "marketing", "name": "Marketing", "dashboard_path": "/app/agents/marketing-agent", "full_service_path": "/app/agents/marketing-agent/full-service", "trial_enabled": True},
    "content-creator": {"type": "agent", "slug": "content-creator", "backend_key": "content", "name": "Content Creator", "dashboard_path": "/app/agents/content-creator", "full_service_path": "/app/agents/content-creator/full-service", "trial_enabled": True},
}

OMNI = {"type": "omni", "slug": "omni", "backend_key": "omni", "name": "Pixie Omni", "dashboard_path": "/app/omni", "full_service_path": "/app/omni/full-service", "trial_enabled": True}

_ALIASES = {
    "omni": "omni", "ask-pixie": "omni", "ask_pixie": "omni", "pixie": "omni", "pixie-omni": "omni",
    "receptionist": "ai-receptionist", "ai_receptionist": "ai-receptionist", "ai-receptionist": "ai-receptionist",
    "website": "website-builder", "website_builder": "website-builder", "website-builder": "website-builder",
    "seo": "seo-agent", "seo_audit": "seo-agent", "seo-audit": "seo-agent", "seo_agent": "seo-agent", "seo-agent": "seo-agent",
    "marketing": "marketing-agent", "marketing_agent": "marketing-agent", "social-media-marketing": "marketing-agent", "marketing-agent": "marketing-agent",
    "content": "content-creator", "content_creator": "content-creator", "ai-content-creator": "content-creator", "content-creator": "content-creator",
}


def normalize_pixie_slug(value):
    if not value:
        return None
    value = value.strip()
    return _ALIASES.get(value, value)


def get_pixie_unit(slug):
    normalized = normalize_pixie_slug(slug)
    if normalized == "omni":
        return OMNI
    return AGENTS.get(normalized)


def get_pixie_unit_or_raise(slug):
    unit = get_pixie_unit(slug)
    if not unit:
        raise ValueError(f"Invalid Pixie unit slug: {slug}")
    return unit
