"""Campaign lifecycle CRUD + state-machine transitions for SEO outreach.

Valid transitions (enforced — invalid transitions raise ValueError):
  draft        → ready | CANCEL
  ready        → approved | draft | CANCEL
  approved     → scheduled | sent | CANCEL
  scheduled    → sent | CANCEL
  sent         → replied | interested | declined | bounced | unsubscribed
  replied      → interested | won | declined
  interested   → won | declined
  won          → (terminal)
  declined     → (terminal)
  bounced      → (terminal)
  unsubscribed → (terminal)

Campaign types: link_gap, guest_post, resource_page, broken_link,
  lost_link_reclamation, local_citation_request, partnership, review_request.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from seo.metering_search import LIMIT_OUTREACH_CAMPAIGNS, enforce_seo_limit

from .stores import (
    Campaign,
    CampaignStatus,
    CampaignType,
    get_campaign_repository,
)

_log = logging.getLogger("pixie.seo.outreach.campaigns")

# ── State-machine transition table ────────────────────────────────────────────

# Maps current_status → set of allowed next statuses.
_TRANSITIONS: Dict[CampaignStatus, frozenset] = {
    CampaignStatus.DRAFT:        frozenset({CampaignStatus.READY}),
    # READY → APPROVED is handled exclusively via approve_campaign() which first
    # writes the approval record; direct transition() calls are blocked here.
    CampaignStatus.READY:        frozenset({CampaignStatus.DRAFT}),
    CampaignStatus.APPROVED:     frozenset({CampaignStatus.SCHEDULED, CampaignStatus.SENT}),
    CampaignStatus.SCHEDULED:    frozenset({CampaignStatus.SENT}),
    CampaignStatus.SENT:         frozenset({
        CampaignStatus.REPLIED,
        CampaignStatus.INTERESTED,
        CampaignStatus.DECLINED,
        CampaignStatus.BOUNCED,
        CampaignStatus.UNSUBSCRIBED,
    }),
    CampaignStatus.REPLIED:      frozenset({
        CampaignStatus.INTERESTED,
        CampaignStatus.WON,
        CampaignStatus.DECLINED,
    }),
    CampaignStatus.INTERESTED:   frozenset({CampaignStatus.WON, CampaignStatus.DECLINED}),
    CampaignStatus.WON:          frozenset(),
    CampaignStatus.DECLINED:     frozenset(),
    CampaignStatus.BOUNCED:      frozenset(),
    CampaignStatus.UNSUBSCRIBED: frozenset(),
}

_TERMINAL_STATES = frozenset({
    CampaignStatus.WON,
    CampaignStatus.DECLINED,
    CampaignStatus.BOUNCED,
    CampaignStatus.UNSUBSCRIBED,
})

# States that require prior approval before sending is allowed.
_APPROVAL_REQUIRED_BEFORE = frozenset({CampaignStatus.SENT, CampaignStatus.SCHEDULED})


def _require_approval(campaign: Campaign) -> None:
    """Raise ValueError when the campaign lacks a recorded approval."""
    if not campaign.approval or not campaign.approval.get("approved_by"):
        raise ValueError("approval_required: campaign must be approved before scheduling/sending")


# ── CRUD ──────────────────────────────────────────────────────────────────────

def create_campaign(
    tenant_id: str,
    *,
    name: str = "",
    site_id: str = "",
    opportunity_id: str = "",
    contact_ids: Optional[List[str]] = None,
    sender_identity: str = "",
    template: str = "",
    personalisation: Optional[Dict] = None,
    campaign_type: CampaignType = CampaignType.LINK_GAP,
    followup_sequence: Optional[List[Dict]] = None,
) -> Tuple[str, Campaign]:
    """Create a new campaign in DRAFT status. Enforces plan limit."""
    repo = get_campaign_repository()
    current = repo.list(tenant_id)
    enforce_seo_limit(tenant_id, LIMIT_OUTREACH_CAMPAIGNS, len(current))

    campaign = Campaign(
        tenant_id=tenant_id,
        name=name,
        site_id=site_id,
        opportunity_id=opportunity_id,
        contact_ids=contact_ids or [],
        sender_identity=sender_identity,
        template=template,
        personalisation=personalisation or {},
        status=CampaignStatus.DRAFT,
        campaign_type=campaign_type,
        followup_sequence=followup_sequence or [],
    )
    return repo.create(campaign)


def get_campaign(tenant_id: str, campaign_id: str) -> Optional[Tuple[str, Campaign]]:
    return get_campaign_repository().get(tenant_id, campaign_id)


def update_campaign(tenant_id: str, campaign_id: str, **fields) -> Optional[Tuple[str, Campaign]]:
    """Update non-status fields. Use transition() to change status."""
    # Prevent bypassing the state machine via a raw update.
    fields.pop("status", None)
    return get_campaign_repository().update(tenant_id, campaign_id, **fields)


def delete_campaign(tenant_id: str, campaign_id: str) -> bool:
    result = get_campaign_repository().get(tenant_id, campaign_id)
    if not result:
        return False
    _, campaign = result
    if campaign.status in _TERMINAL_STATES or campaign.status in (
        CampaignStatus.SENT, CampaignStatus.SCHEDULED
    ):
        raise ValueError(f"cannot_delete_campaign_in_status: {campaign.status.value}")
    return get_campaign_repository().delete(tenant_id, campaign_id)


def list_campaigns(tenant_id: str) -> List[Tuple[str, Campaign]]:
    return get_campaign_repository().list(tenant_id)


def list_campaigns_by_site(tenant_id: str, site_id: str) -> List[Tuple[str, Campaign]]:
    return get_campaign_repository().list_by_site(tenant_id, site_id)


# ── State machine ─────────────────────────────────────────────────────────────

def transition(
    tenant_id: str,
    campaign_id: str,
    new_status: CampaignStatus,
    *,
    actor: str = "",
    notes: str = "",
) -> Tuple[str, Campaign]:
    """Move campaign to new_status. Raises ValueError on invalid transition."""
    result = get_campaign_repository().get(tenant_id, campaign_id)
    if not result:
        raise ValueError(f"campaign_not_found: {campaign_id!r}")
    cid, campaign = result

    allowed = _TRANSITIONS.get(campaign.status, frozenset())
    if new_status not in allowed:
        raise ValueError(
            f"invalid_transition: {campaign.status.value} → {new_status.value}; "
            f"allowed: {[s.value for s in allowed]}"
        )

    # Approval gate: require approval before scheduling/sending.
    if new_status in _APPROVAL_REQUIRED_BEFORE:
        _require_approval(campaign)

    updated = get_campaign_repository().update(tenant_id, campaign_id, status=new_status)
    _log.info(
        "campaign %s transitioned %s → %s by %s",
        campaign_id, campaign.status.value, new_status.value, actor or "system",
    )
    return updated


def approve_campaign(
    tenant_id: str,
    campaign_id: str,
    *,
    approved_by: str,
    notes: str = "",
) -> Tuple[str, Campaign]:
    """Record approval on a campaign and move it to APPROVED status.

    This is the ONLY path to APPROVED status. Direct transition() calls from
    READY → APPROVED are blocked in the state machine; callers must use this
    function which writes the approval record atomically with the status update.
    """
    from seo.stores import _now
    result = get_campaign_repository().get(tenant_id, campaign_id)
    if not result:
        raise ValueError(f"campaign_not_found: {campaign_id!r}")
    cid, campaign = result

    if campaign.status not in (CampaignStatus.READY,):
        raise ValueError(
            f"cannot_approve: campaign must be in READY status, currently {campaign.status.value}"
        )

    approval_record = {
        "approved_by": approved_by,
        "approved_at": _now(),
        "notes": notes,
    }
    # Write approval + status in one update (bypasses transition() on purpose —
    # approve_campaign is the privileged path for READY → APPROVED).
    updated = get_campaign_repository().update(
        tenant_id, campaign_id,
        approval=approval_record,
        status=CampaignStatus.APPROVED,
    )
    _log.info("campaign %s approved by %s", campaign_id, approved_by)
    return updated


def attach_contacts(
    tenant_id: str,
    campaign_id: str,
    contact_ids: List[str],
) -> Optional[Tuple[str, Campaign]]:
    """Attach contacts to a campaign."""
    result = get_campaign_repository().get(tenant_id, campaign_id)
    if not result:
        raise ValueError(f"campaign_not_found: {campaign_id!r}")
    cid, campaign = result
    existing = set(campaign.contact_ids)
    existing.update(contact_ids)
    return get_campaign_repository().update(tenant_id, campaign_id, contact_ids=list(existing))
