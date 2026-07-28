"""Location CRUD + archive/restore for the Local SEO vertical.

Enforces the LIMIT_LOCATIONS plan limit on create.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from seo.metering_search import LIMIT_LOCATIONS, enforce_seo_limit
from seo.local.stores import (
    Location,
    LocationRepository,
    _now,
    get_location_repository,
)

_log = logging.getLogger("pixie.seo.local.locations")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_location_dict(loc_id: str, loc: Location) -> Dict[str, Any]:
    """Serialize a Location for API responses."""
    return {
        "id": loc_id,
        "tenant_id": loc.tenant_id,
        "site_id": loc.site_id,
        "business_name": loc.business_name,
        "address_line1": loc.address_line1,
        "address_line2": loc.address_line2,
        "city": loc.city,
        "region": loc.region,
        "postal_code": loc.postal_code,
        "country": loc.country,
        "phone": loc.phone,
        "website_url": loc.website_url,
        "primary_category": loc.primary_category,
        "secondary_categories": loc.secondary_categories,
        "service_areas": loc.service_areas,
        "hours": loc.hours,
        "lat": loc.lat,
        "lng": loc.lng,
        "local_page_url": loc.local_page_url,
        "gbp_location_id": loc.gbp_location_id,
        "nap_canonical": loc.nap_canonical,
        "archived": loc.archived,
        "archived_at": loc.archived_at,
        "created_at": loc.created_at,
        "updated_at": loc.updated_at,
    }


# ── Public API ─────────────────────────────────────────────────────────────────

def create_location(
    tenant_id: str,
    site_id: str,
    business_name: str,
    *,
    address_line1: str = "",
    address_line2: str = "",
    city: str = "",
    region: str = "",
    postal_code: str = "",
    country: str = "US",
    phone: str = "",
    website_url: str = "",
    primary_category: str = "",
    secondary_categories: Optional[List[str]] = None,
    service_areas: Optional[List[str]] = None,
    hours: Optional[Dict] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    local_page_url: str = "",
) -> Tuple[str, Location]:
    """Create a new location.  Raises SeoLimitExceeded when the plan cap is hit."""
    repo = get_location_repository()
    existing = repo.list_active(tenant_id)
    enforce_seo_limit(tenant_id, LIMIT_LOCATIONS, len(existing))

    loc = Location(
        tenant_id=tenant_id,
        site_id=site_id,
        business_name=business_name,
        address_line1=address_line1,
        address_line2=address_line2,
        city=city,
        region=region,
        postal_code=postal_code,
        country=country,
        phone=phone,
        website_url=website_url,
        primary_category=primary_category,
        secondary_categories=secondary_categories or [],
        service_areas=service_areas or [],
        hours=hours or {},
        lat=lat,
        lng=lng,
        local_page_url=local_page_url,
    )
    return repo.create(loc)


def get_location(tenant_id: str, location_id: str) -> Optional[Tuple[str, Location]]:
    """Fetch a single location (None if missing or wrong tenant)."""
    return get_location_repository().get(tenant_id, location_id)


def list_locations(
    tenant_id: str,
    *,
    site_id: Optional[str] = None,
    include_archived: bool = False,
) -> List[Tuple[str, Location]]:
    """List locations, optionally filtered by site and archived status."""
    repo = get_location_repository()
    if site_id:
        rows = repo.list_by_site(tenant_id, site_id)
    else:
        rows = repo.list(tenant_id)
    if not include_archived:
        rows = [(lid, loc) for lid, loc in rows if not loc.archived]
    return rows


def update_location(
    tenant_id: str,
    location_id: str,
    **fields,
) -> Optional[Tuple[str, Location]]:
    """Patch one or more fields on a location."""
    return get_location_repository().update(tenant_id, location_id, **fields)


def archive_location(
    tenant_id: str,
    location_id: str,
) -> Optional[Tuple[str, Location]]:
    """Soft-delete a location."""
    return get_location_repository().update(
        tenant_id, location_id, archived=True, archived_at=_now()
    )


def restore_location(
    tenant_id: str,
    location_id: str,
) -> Optional[Tuple[str, Location]]:
    """Restore a soft-deleted location."""
    return get_location_repository().update(
        tenant_id, location_id, archived=False, archived_at=""
    )


def delete_location(tenant_id: str, location_id: str) -> bool:
    """Hard-delete a location row."""
    return get_location_repository().delete(tenant_id, location_id)
