"""Durable, tenant-scoped repositories for the SEO Outreach vertical.

Reuses the exact same envelope convention + ``_AutoRepo`` base from
``seo/search_stores.py`` so records are in-memory for tests and durable for
``file``/``supabase`` backends.

Entity → table mapping (NO DIGITS in table names):
  Contact          → seo_outreach_contacts
  Campaign         → seo_outreach_campaigns
  Draft            → seo_outreach_drafts
  Followup         → seo_outreach_followups
  LinkPlacement    → seo_link_placements
  SuppressionEntry → seo_outreach_suppression

Id prefixes:
  oc_  (outreach contact)
  camp_ (campaign)
  odraft_ (outreach draft)
  ofu_ (outreach followup)
  lp_  (link placement)
  supp_ (suppression entry)
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

# Reuse the base repo + helpers from the existing SEO stores module.
from seo.stores import _Repo, _uid, _now, _restore_enum  # noqa: F401
from seo.search_stores import _AutoRepo  # noqa: F401


# ── Enums ─────────────────────────────────────────────────────────────────────

class VerificationStatus(str, Enum):
    UNVERIFIED = "unverified"
    VERIFIED   = "verified"
    INVALID    = "invalid"
    BOUNCED    = "bounced"


class RelationshipStatus(str, Enum):
    COLD       = "cold"
    CONTACTED  = "contacted"
    REPLIED    = "replied"
    INTERESTED = "interested"
    PARTNER    = "partner"
    DECLINED   = "declined"
    DO_NOT_CONTACT = "do_not_contact"


class BounceStatus(str, Enum):
    NONE      = "none"
    SOFT      = "soft"
    HARD      = "hard"


class CampaignStatus(str, Enum):
    DRAFT        = "draft"
    READY        = "ready"
    APPROVED     = "approved"
    SCHEDULED    = "scheduled"
    SENT         = "sent"
    REPLIED      = "replied"
    INTERESTED   = "interested"
    WON          = "won"
    DECLINED     = "declined"
    BOUNCED      = "bounced"
    UNSUBSCRIBED = "unsubscribed"


class CampaignType(str, Enum):
    LINK_GAP               = "link_gap"
    GUEST_POST             = "guest_post"
    RESOURCE_PAGE          = "resource_page"
    BROKEN_LINK            = "broken_link"
    LOST_LINK_RECLAMATION  = "lost_link_reclamation"
    LOCAL_CITATION_REQUEST = "local_citation_request"
    PARTNERSHIP            = "partnership"
    REVIEW_REQUEST         = "review_request"


class DraftStatus(str, Enum):
    DRAFT    = "draft"
    REVISED  = "revised"
    APPROVED = "approved"
    REJECTED = "rejected"


class FollowupStatus(str, Enum):
    SCHEDULED = "scheduled"
    SENT      = "sent"
    SKIPPED   = "skipped"
    STOPPED   = "stopped"


class PlacementOutcome(str, Enum):
    PENDING  = "pending"
    LINK_WON = "link_won"
    CITATION = "citation"
    MENTION  = "mention"
    DECLINED = "declined"
    REMOVED  = "removed"


class SuppressionReason(str, Enum):
    UNSUBSCRIBE = "unsubscribe"
    BOUNCE      = "bounce"
    MANUAL      = "manual"
    SPAM        = "spam"


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class Contact:
    """An outreach prospect contact for a workspace."""
    tenant_id: str
    domain: str
    website: str                       = ""
    name: str                          = ""
    role: str                          = ""
    email: str                         = ""
    source: str                        = ""        # "manual" | "csv" | "backlink" | "api"
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    relationship_status: RelationshipStatus = RelationshipStatus.COLD
    tags: List[str]                    = field(default_factory=list)
    notes: str                         = ""
    last_contacted: str                = ""
    consent_notes: str                 = ""
    do_not_contact: bool               = False
    bounce_status: BounceStatus        = BounceStatus.NONE
    created_at: str                    = ""
    updated_at: str                    = ""


@dataclass
class Campaign:
    """An outreach campaign targeting one or more contacts."""
    tenant_id: str
    site_id: str                       = ""
    opportunity_id: str                = ""
    contact_ids: List[str]             = field(default_factory=list)
    sender_identity: str               = ""        # "from" identity (name <email>)
    template: str                      = ""
    personalisation: Dict              = field(default_factory=dict)
    status: CampaignStatus             = CampaignStatus.DRAFT
    approval: Dict                     = field(default_factory=dict)  # {approved_by, approved_at, notes}
    send_schedule: str                 = ""        # ISO datetime
    followup_sequence: List[Dict]      = field(default_factory=list)  # [{delay_seconds, template}]
    outcome: str                       = ""
    campaign_type: CampaignType        = CampaignType.LINK_GAP
    name: str                          = ""
    created_at: str                    = ""
    updated_at: str                    = ""


@dataclass
class Draft:
    """AI-generated email draft for a campaign+contact pair. Versioned."""
    tenant_id: str
    campaign_id: str
    contact_id: str
    subject: str                       = ""
    body: str                          = ""
    evidence: Dict                     = field(default_factory=dict)  # evidence used in generation
    version: int                       = 1
    status: DraftStatus                = DraftStatus.DRAFT
    approved: bool                     = False
    approved_by: str                   = ""
    approved_at: str                   = ""
    generation_model: str              = ""
    created_at: str                    = ""
    updated_at: str                    = ""


@dataclass
class Followup:
    """A scheduled follow-up message for a campaign+contact pair."""
    tenant_id: str
    campaign_id: str
    contact_id: str
    sequence_index: int                = 0
    scheduled_for: str                 = ""        # ISO datetime
    status: FollowupStatus             = FollowupStatus.SCHEDULED
    sent_at: str                       = ""
    stop_reason: str                   = ""        # "reply" | "unsubscribe" | "bounce" | "manual_close"
    draft_id: str                      = ""
    created_at: str                    = ""
    updated_at: str                    = ""


@dataclass
class LinkPlacement:
    """Tracks a won/pending earned link or citation placement."""
    tenant_id: str
    campaign_id: str
    contact_id: str
    outcome: PlacementOutcome          = PlacementOutcome.PENDING
    target_url: str                    = ""        # our page the link points to
    source_url: str                    = ""        # the linking page
    anchor: str                        = ""
    rel: str                           = ""        # "dofollow" | "nofollow" | "ugc" | "sponsored"
    first_verified: str                = ""
    last_verified: str                 = ""
    last_verified_status: str          = ""        # "present" | "removed"
    created_at: str                    = ""
    updated_at: str                    = ""


@dataclass
class SuppressionEntry:
    """Global suppression record — do not email this address/domain."""
    tenant_id: str
    email: str                         = ""        # normalised lowercase
    domain: str                        = ""        # normalised domain (optional, domain-wide suppress)
    reason: SuppressionReason          = SuppressionReason.MANUAL
    notes: str                         = ""
    created_at: str                    = ""
    updated_at: str                    = ""


# ── Concrete repositories ──────────────────────────────────────────────────────

class ContactRepository(_AutoRepo):
    table_name = "seo_outreach_contacts"
    model = Contact
    id_prefix = "oc_"
    enum_fields = {
        "verification_status": VerificationStatus,
        "relationship_status": RelationshipStatus,
        "bounce_status": BounceStatus,
    }

    def find_by_email(self, tenant_id: str, email: str) -> Optional[Tuple[str, Contact]]:
        """Find the first contact matching a normalised email."""
        norm = email.strip().lower()
        for pair in self.list_where(tenant_id, email=norm):
            return pair
        return None

    def list_by_site(self, tenant_id: str, site_id: str):
        """Contacts are not directly site-scoped; this is a no-op helper placeholder."""
        return self.list(tenant_id)


class CampaignRepository(_AutoRepo):
    table_name = "seo_outreach_campaigns"
    model = Campaign
    id_prefix = "camp_"
    enum_fields = {
        "status": CampaignStatus,
        "campaign_type": CampaignType,
    }

    def list_by_site(self, tenant_id: str, site_id: str):
        return self.list_where(tenant_id, site_id=site_id)

    def list_by_opportunity(self, tenant_id: str, opportunity_id: str):
        return self.list_where(tenant_id, opportunity_id=opportunity_id)


class DraftRepository(_AutoRepo):
    table_name = "seo_outreach_drafts"
    model = Draft
    id_prefix = "odraft_"
    enum_fields = {"status": DraftStatus}

    def list_by_campaign(self, tenant_id: str, campaign_id: str):
        return self.list_where(tenant_id, campaign_id=campaign_id)

    def list_by_contact(self, tenant_id: str, contact_id: str):
        return self.list_where(tenant_id, contact_id=contact_id)


class FollowupRepository(_AutoRepo):
    table_name = "seo_outreach_followups"
    model = Followup
    id_prefix = "ofu_"
    enum_fields = {"status": FollowupStatus}

    def list_by_campaign(self, tenant_id: str, campaign_id: str):
        return self.list_where(tenant_id, campaign_id=campaign_id)

    def list_scheduled(self, tenant_id: str, before_iso: str):
        """List all SCHEDULED followups due before a given ISO timestamp."""
        out = []
        for rid, fu in self.list_where(tenant_id, status=FollowupStatus.SCHEDULED.value):
            if fu.scheduled_for and fu.scheduled_for <= before_iso:
                out.append((rid, fu))
        return out


class LinkPlacementRepository(_AutoRepo):
    table_name = "seo_link_placements"
    model = LinkPlacement
    id_prefix = "lp_"
    enum_fields = {"outcome": PlacementOutcome}

    def list_by_campaign(self, tenant_id: str, campaign_id: str):
        return self.list_where(tenant_id, campaign_id=campaign_id)

    def list_won(self, tenant_id: str):
        """All placements with a won outcome for this tenant."""
        out = []
        for pair in self.list(tenant_id):
            rid, lp = pair
            if lp.outcome == PlacementOutcome.LINK_WON:
                out.append(pair)
        return out


class SuppressionRepository(_AutoRepo):
    table_name = "seo_outreach_suppression"
    model = SuppressionEntry
    id_prefix = "supp_"
    enum_fields = {"reason": SuppressionReason}

    def is_suppressed(self, tenant_id: str, email: str) -> bool:
        """Return True when the normalised email or its domain (domain-wide) is suppressed.

        A domain-wide suppression entry has email='' and a non-empty domain. An
        entry with a specific email only suppresses that exact address.
        """
        norm_email = email.strip().lower()
        domain = norm_email.split("@")[-1] if "@" in norm_email else ""
        for _, entry in self.list(tenant_id):
            # Exact email match.
            if entry.email and entry.email == norm_email:
                return True
            # Domain-wide suppression: entry has no specific email, only domain.
            if not entry.email and entry.domain and domain and entry.domain == domain:
                return True
        return False

    def find_by_email(self, tenant_id: str, email: str) -> Optional[Tuple[str, SuppressionEntry]]:
        norm = email.strip().lower()
        for pair in self.list_where(tenant_id, email=norm):
            return pair
        return None


# ── Singletons ─────────────────────────────────────────────────────────────────

_REPOS: dict = {}


def _repo(key: str, cls):
    if key not in _REPOS:
        _REPOS[key] = cls()
    return _REPOS[key]


def reset_repositories() -> None:
    """Clear cached repo singletons. Call between tests or after env changes."""
    _REPOS.clear()


def get_contact_repository() -> ContactRepository:
    return _repo("outreach_contact", ContactRepository)


def get_campaign_repository() -> CampaignRepository:
    return _repo("outreach_campaign", CampaignRepository)


def get_draft_repository() -> DraftRepository:
    return _repo("outreach_draft", DraftRepository)


def get_followup_repository() -> FollowupRepository:
    return _repo("outreach_followup", FollowupRepository)


def get_link_placement_repository() -> LinkPlacementRepository:
    return _repo("outreach_link_placement", LinkPlacementRepository)


def get_suppression_repository() -> SuppressionRepository:
    return _repo("outreach_suppression", SuppressionRepository)


# All repository classes, for migration-coverage tests / introspection.
ALL_REPOSITORIES = (
    ContactRepository,
    CampaignRepository,
    DraftRepository,
    FollowupRepository,
    LinkPlacementRepository,
    SuppressionRepository,
)
