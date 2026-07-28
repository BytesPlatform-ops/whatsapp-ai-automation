"""LocalBusiness JSON-LD schema builder + approval gate for the Local SEO vertical.

Builds schema types:
  LocalBusiness (default), Restaurant, MedicalBusiness,
  HomeAndConstructionBusiness, LegalService, FinancialService, etc.

Includes:
  - PostalAddress
  - GeoCoordinates (when lat/lng available)
  - OpeningHoursSpecification
  - AggregateRating / Review ONLY when policy_compliant_rating=True
    (requires explicit user acknowledgement — cannot be automatically set)
  - SameAs (links to GBP, social profiles, citation directories)
  - Service (service offerings)
  - AreaServed

Validation: structural JSON-LD checks (required fields, type checks).
Approval gate: schema is stored as PROPOSED and must be approved before publishing.

Handoff note: WordPress / site-builder deployment and recrawl verification
are noted in the schema record.  The fix_verify seam from seo.fix_verify is
referenced for recrawl.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from seo.local.stores import (
    LocalSchema,
    SchemaStatus,
    _now,
    get_local_schema_repository,
    get_location_repository,
)

_log = logging.getLogger("pixie.seo.local.schema")

# Known LocalBusiness sub-types (schema.org)
_SCHEMA_TYPES = {
    "LocalBusiness",
    "Restaurant",
    "CafeOrCoffeeShop",
    "FastFoodRestaurant",
    "BarOrPub",
    "MedicalBusiness",
    "Dentist",
    "Optician",
    "Physician",
    "Pharmacy",
    "HomeAndConstructionBusiness",
    "Plumber",
    "Electrician",
    "GeneralContractor",
    "HVACBusiness",
    "RoofingContractor",
    "LegalService",
    "Attorney",
    "Accountant",
    "FinancialService",
    "InsuranceAgency",
    "AutoRepair",
    "BeautySalon",
    "HairSalon",
    "NailSalon",
    "GroceryStore",
    "Florist",
    "PetStore",
    "Locksmith",
    "MovingCompany",
    "RealEstateAgent",
    "TravelAgency",
    "Winery",
    "BowlingAlley",
    "FitnessCenter",
    "Hotel",
    "Store",
    "ShoppingCenter",
}

# GBP hours day mapping
_GBP_DAYS = {
    "MONDAY": "Monday",
    "TUESDAY": "Tuesday",
    "WEDNESDAY": "Wednesday",
    "THURSDAY": "Thursday",
    "FRIDAY": "Friday",
    "SATURDAY": "Saturday",
    "SUNDAY": "Sunday",
}


def _build_opening_hours(hours: Dict) -> List[Dict]:
    """Convert Location hours dict to OpeningHoursSpecification array."""
    specs = []
    for day_key, day_name in _GBP_DAYS.items():
        periods = hours.get(day_key) or hours.get(day_name, [])
        if not periods:
            continue
        if isinstance(periods, dict):
            periods = [periods]
        for period in periods:
            if isinstance(period, dict):
                opens = period.get("openTime") or period.get("opens", "")
                closes = period.get("closeTime") or period.get("closes", "")
            else:
                opens = closes = ""
            if opens and closes:
                specs.append({
                    "@type": "OpeningHoursSpecification",
                    "dayOfWeek": f"http://schema.org/{day_name}",
                    "opens": opens,
                    "closes": closes,
                })
    return specs


def build_jsonld(
    location_id: str,
    loc: Any,
    *,
    schema_type: str = "LocalBusiness",
    service_areas: Optional[List[str]] = None,
    same_as_urls: Optional[List[str]] = None,
    service_names: Optional[List[str]] = None,
    policy_compliant_rating: bool = False,
    aggregate_rating: Optional[Dict] = None,
) -> Dict[str, Any]:
    """Build a LocalBusiness JSON-LD dict from a Location record.

    policy_compliant_rating=True MUST be explicitly set by the caller with
    evidence of policy compliance — this module never auto-sets it.
    """
    if schema_type not in _SCHEMA_TYPES:
        _log.warning("seo.local.schema: unknown schema_type %r, defaulting to LocalBusiness", schema_type)
        schema_type = "LocalBusiness"

    jsonld: Dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": schema_type,
        "name": loc.business_name,
        "telephone": loc.phone or None,
        "url": loc.website_url or None,
        "address": {
            "@type": "PostalAddress",
            "streetAddress": " ".join(
                p for p in [loc.address_line1, loc.address_line2] if p
            ),
            "addressLocality": loc.city,
            "addressRegion": loc.region,
            "postalCode": loc.postal_code,
            "addressCountry": loc.country,
        },
    }

    # Remove None top-level values
    jsonld = {k: v for k, v in jsonld.items() if v is not None}

    # GeoCoordinates
    if loc.lat is not None and loc.lng is not None:
        jsonld["geo"] = {
            "@type": "GeoCoordinates",
            "latitude": loc.lat,
            "longitude": loc.lng,
        }

    # Opening hours
    if loc.hours:
        oh_specs = _build_opening_hours(loc.hours)
        if oh_specs:
            jsonld["openingHoursSpecification"] = oh_specs

    # SameAs
    same_as = list(same_as_urls or [])
    if loc.gbp_location_id:
        # GBP profile URL (constructed from location name if it's a full resource path)
        gbp_url = f"https://www.google.com/maps?cid={loc.gbp_location_id.split('/')[-1]}"
        if gbp_url not in same_as:
            same_as.append(gbp_url)
    if same_as:
        jsonld["sameAs"] = same_as

    # AreaServed
    areas = service_areas or loc.service_areas or []
    if areas:
        if len(areas) == 1:
            jsonld["areaServed"] = areas[0]
        else:
            jsonld["areaServed"] = [{"@type": "City", "name": a} for a in areas]

    # Services (hasOfferCatalog)
    if service_names:
        jsonld["hasOfferCatalog"] = {
            "@type": "OfferCatalog",
            "name": f"{loc.business_name} Services",
            "itemListElement": [
                {"@type": "Offer", "itemOffered": {"@type": "Service", "name": s}}
                for s in service_names
            ],
        }

    # AggregateRating — ONLY when policy_compliant_rating is explicitly True
    if policy_compliant_rating and aggregate_rating:
        jsonld["aggregateRating"] = {
            "@type": "AggregateRating",
            "ratingValue": aggregate_rating.get("ratingValue"),
            "reviewCount": aggregate_rating.get("reviewCount"),
            "bestRating": aggregate_rating.get("bestRating", 5),
            "worstRating": aggregate_rating.get("worstRating", 1),
        }

    return jsonld


def validate_jsonld(jsonld: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Validate a JSON-LD dict structurally.

    Returns (is_valid, list_of_issues).
    """
    issues: List[str] = []

    if jsonld.get("@context") != "https://schema.org":
        issues.append("@context should be 'https://schema.org'")

    schema_type = jsonld.get("@type", "")
    if not schema_type:
        issues.append("Missing @type")
    elif schema_type not in _SCHEMA_TYPES:
        issues.append(f"Unknown @type: {schema_type!r}")

    if not jsonld.get("name"):
        issues.append("Missing required field: name")

    address = jsonld.get("address", {})
    if address:
        if not address.get("streetAddress"):
            issues.append("address.streetAddress is empty")
        if not address.get("addressLocality"):
            issues.append("address.addressLocality (city) is empty")

    geo = jsonld.get("geo", {})
    if geo:
        if "latitude" not in geo or "longitude" not in geo:
            issues.append("geo block missing latitude or longitude")

    agg = jsonld.get("aggregateRating", {})
    if agg:
        if "ratingValue" not in agg:
            issues.append("aggregateRating missing ratingValue")
        if "reviewCount" not in agg:
            issues.append("aggregateRating missing reviewCount")

    # Validate JSON-LD is serialisable
    try:
        json.dumps(jsonld)
    except Exception as exc:
        issues.append(f"JSON-LD is not serialisable: {exc}")

    return len(issues) == 0, issues


# ── CRUD ──────────────────────────────────────────────────────────────────────

def propose_schema(
    tenant_id: str,
    location_id: str,
    *,
    schema_type: str = "LocalBusiness",
    service_areas: Optional[List[str]] = None,
    same_as_urls: Optional[List[str]] = None,
    service_names: Optional[List[str]] = None,
    policy_compliant_rating: bool = False,
    aggregate_rating: Optional[Dict] = None,
    notes: str = "",
) -> Dict[str, Any]:
    """Build and persist a PROPOSED LocalBusiness JSON-LD schema.

    Always stored as PROPOSED; requires manual approval.
    Returns {schema_id, jsonld, validation_issues, status}.
    """
    loc_repo = get_location_repository()
    loc_result = loc_repo.get(tenant_id, location_id)
    if loc_result is None:
        return {"error": "location_not_found"}
    _, loc = loc_result

    jsonld = build_jsonld(
        location_id,
        loc,
        schema_type=schema_type,
        service_areas=service_areas,
        same_as_urls=same_as_urls,
        service_names=service_names,
        policy_compliant_rating=policy_compliant_rating,
        aggregate_rating=aggregate_rating,
    )

    is_valid, issues = validate_jsonld(jsonld)

    schema = LocalSchema(
        tenant_id=tenant_id,
        location_id=location_id,
        schema_type=schema_type,
        jsonld=jsonld,
        status=SchemaStatus.PROPOSED,
        include_aggregate_rating=policy_compliant_rating,
        notes=notes,
    )
    schema_repo = get_local_schema_repository()
    sid, saved = schema_repo.create(schema)

    return {
        "schema_id": sid,
        "jsonld": jsonld,
        "status": SchemaStatus.PROPOSED.value,
        "is_valid": is_valid,
        "validation_issues": issues,
        "deployment_note": (
            "This schema must be approved and then deployed to your website. "
            "For WordPress: use the SEO plugin (RankMath/Yoast) or inject via functions.php. "
            "For site builders: paste the JSON-LD into a custom code block in the <head>. "
            "After deployment, trigger a recrawl via Google Search Console to pick up changes."
        ),
    }


def approve_schema(
    tenant_id: str,
    schema_id: str,
    *,
    approved_by: str = "",
) -> Dict[str, Any]:
    """Approve a proposed schema.  Marks as APPROVED — not yet published."""
    schema_repo = get_local_schema_repository()
    result = schema_repo.get(tenant_id, schema_id)
    if result is None:
        return {"error": "schema_not_found"}
    _, schema = result
    if schema.status != SchemaStatus.PROPOSED:
        return {"error": "not_proposed", "current_status": schema.status.value}

    ts = _now()
    schema_repo.update(
        tenant_id, schema_id,
        status=SchemaStatus.APPROVED,
        approved_at=ts,
        approved_by=approved_by or "unknown",
    )
    return {
        "schema_id": schema_id,
        "status": SchemaStatus.APPROVED.value,
        "approved_at": ts,
        "approved_by": approved_by,
        "next_step": (
            "Deploy the JSON-LD to your website. "
            "Then call /schema/{schema_id}/published to mark as deployed."
        ),
    }


def mark_published(
    tenant_id: str,
    schema_id: str,
) -> Optional[Tuple[str, LocalSchema]]:
    """Mark a schema as published after deployment."""
    ts = _now()
    return get_local_schema_repository().update(
        tenant_id, schema_id,
        status=SchemaStatus.PUBLISHED,
        published_at=ts,
    )


def list_schemas(
    tenant_id: str,
    location_id: str,
    *,
    status: Optional[SchemaStatus] = None,
) -> List[Tuple[str, LocalSchema]]:
    schema_repo = get_local_schema_repository()
    rows = schema_repo.list_by_location(tenant_id, location_id)
    if status is not None:
        rows = [(sid, s) for sid, s in rows if s.status == status]
    return rows


def get_schema(
    tenant_id: str,
    schema_id: str,
) -> Optional[Tuple[str, LocalSchema]]:
    return get_local_schema_repository().get(tenant_id, schema_id)


def audit_schema(
    tenant_id: str,
    location_id: str,
) -> Dict[str, Any]:
    """Run a schema audit for a location.

    Returns the latest approved/published schema plus validation results.
    """
    schema_repo = get_local_schema_repository()
    schemas = schema_repo.list_by_location(tenant_id, location_id)

    if not schemas:
        return {
            "location_id": location_id,
            "has_schema": False,
            "recommendation": "No LocalBusiness schema found. Use propose_schema to create one.",
        }

    # Find the latest approved or published schema
    approved = [
        (sid, s) for sid, s in schemas
        if s.status in (SchemaStatus.APPROVED, SchemaStatus.PUBLISHED)
    ]
    if approved:
        approved.sort(key=lambda p: p[1].approved_at or "", reverse=True)
        sid, schema = approved[0]
    else:
        # Fall back to latest proposed
        schemas.sort(key=lambda p: p[1].created_at or "", reverse=True)
        sid, schema = schemas[0]

    is_valid, issues = validate_jsonld(schema.jsonld)

    return {
        "location_id": location_id,
        "has_schema": True,
        "schema_id": sid,
        "schema_type": schema.schema_type,
        "status": schema.status.value,
        "is_valid": is_valid,
        "validation_issues": issues,
        "recrawl_verified": schema.recrawl_verified,
        "deployment_note": (
            "Recrawl verification is pending. "
            "Submit the URL in Google Search Console to verify schema pickup."
            if not schema.recrawl_verified and schema.status == SchemaStatus.PUBLISHED
            else ""
        ),
    }
