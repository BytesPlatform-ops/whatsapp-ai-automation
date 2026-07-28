"""AI email drafting for SEO outreach campaigns.

Rules (enforced):
- No fake compliments, no invented facts, no deceptive claims.
- No fake prior relationship.
- No copied competitor content.
- Evidence used in generation is returned and stored.
- Drafts are editable; version history is maintained by incrementing version.
- Approval is REQUIRED before sending (draft.approved must be True).

Security:
- Email header injection: strip CR/LF from subject and recipient fields.
- HTML injection: escape user-supplied values in body.
- Open-redirect in campaign links: all URLs validated via assert_safe_url.

Metering: record_outreach_draft is called on every successful generation.
In tests with is_mock=True (or credit system OFF) it records zero.
"""

from __future__ import annotations

import html
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from seo.metering_search import (
    LIMIT_OUTREACH_DRAFTS,
    enforce_seo_limit,
    record_outreach_draft,
)
from seo.url_guard import UrlRejected, assert_safe_url

from .stores import (
    Draft,
    DraftStatus,
    get_campaign_repository,
    get_contact_repository,
    get_draft_repository,
)

_log = logging.getLogger("pixie.seo.outreach.drafts")


# ── Security helpers ──────────────────────────────────────────────────────────

def _strip_header_injection(value: str) -> str:
    """Remove CR and LF from any string destined for an email header."""
    return value.replace("\r", "").replace("\n", "")


def _escape_html(value: str) -> str:
    """Escape HTML special chars in user-provided values."""
    return html.escape(value, quote=True)


def _validate_url_in_body(url: str) -> str:
    """Assert a URL is safe (no SSRF, no open-redirect). Returns the URL unchanged."""
    try:
        assert_safe_url(url)
    except UrlRejected as exc:
        raise ValueError(f"unsafe_url_in_body: {exc.reason}") from exc
    return url


def _extract_urls(text: str) -> List[str]:
    """Find all http/https URLs in a text block."""
    return re.findall(r"https?://[^\s\"'<>]+", text)


def _secure_subject(subject: str) -> str:
    return _strip_header_injection(subject).strip()


def _secure_body(body: str, *, check_urls: bool = True) -> str:
    """Strip header-injection chars and validate embedded URLs."""
    cleaned = body.replace("\r\n", "\n").replace("\r", "\n")
    if check_urls:
        for url in _extract_urls(cleaned):
            try:
                _validate_url_in_body(url)
            except ValueError:
                # Remove unsafe URLs from the body rather than failing.
                cleaned = cleaned.replace(url, "[URL_REMOVED]")
                _log.warning("unsafe URL stripped from draft body: %s", url[:80])
    return cleaned


# ── Draft generation ──────────────────────────────────────────────────────────

_DRAFT_SYSTEM_PROMPT = """\
You are an expert SEO outreach specialist writing a personalised, honest email
on behalf of a client. Follow these MANDATORY rules:
1. No fake compliments — only cite real, specific things you observed.
2. No invented facts — only use evidence provided in the context.
3. No deceptive claims — do not imply a relationship that does not exist.
4. No fake prior-relationship language ("as we discussed", "following up on our call").
5. No copied competitor content.
6. Be specific, brief, and direct. One clear value proposition.
7. Include the evidence source in the email where relevant (specific page/resource).
Return ONLY the email in this JSON format:
{"subject": "...", "body": "..."}
"""


def _build_draft_prompt(
    *,
    campaign_type: str,
    contact_name: str,
    contact_role: str,
    contact_domain: str,
    client_page: str,
    target_site: str,
    evidence: Dict[str, Any],
    brand_tone: str = "professional",
) -> str:
    evidence_text = "\n".join(f"- {k}: {v}" for k, v in evidence.items()) if evidence else "No specific evidence provided."
    return f"""Campaign type: {campaign_type}
Contact: {_escape_html(contact_name)} ({_escape_html(contact_role)}) at {_escape_html(contact_domain)}
Client page: {client_page}
Target site: {target_site}
Brand tone: {brand_tone}
Evidence:
{evidence_text}

Write a brief, honest outreach email. Cite only the evidence above. Do not invent any facts."""


def _call_llm(prompt: str, *, is_mock: bool) -> Dict[str, str]:
    """Call LLM for draft generation. Returns {subject, body}.

    In mock mode (is_mock=True or PIXIE_MODEL_MODE != openai) returns a
    deterministic template — zero cost, no network.
    """
    model_mode = os.getenv("PIXIE_MODEL_MODE", "fake")
    if is_mock or model_mode != "openai":
        return {
            "subject": "Collaboration opportunity for [MOCK DRAFT]",
            "body": (
                "Hi [NAME],\n\n"
                "I noticed your resource page on [DOMAIN] and wanted to reach out "
                "about a potential link exchange.\n\n"
                "This is a mock draft — set PIXIE_MODEL_MODE=openai to generate real content.\n\n"
                "Best,\n[SENDER]"
            ),
        }

    try:
        import json as _json
        from openai import OpenAI
        client = OpenAI()
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _DRAFT_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=600,
            temperature=0.4,
        )
        raw = resp.choices[0].message.content or "{}"
        parsed = _json.loads(raw)
        return {
            "subject": str(parsed.get("subject", "")),
            "body": str(parsed.get("body", "")),
        }
    except Exception as exc:
        _log.warning("LLM draft generation failed, using fallback: %s", exc)
        return {
            "subject": "Outreach opportunity",
            "body": "Hi,\n\nI wanted to reach out about a potential collaboration.\n\nBest regards",
        }


def generate_draft(
    tenant_id: str,
    campaign_id: str,
    contact_id: str,
    *,
    evidence: Optional[Dict[str, Any]] = None,
    client_page: str = "",
    brand_tone: str = "professional",
    is_mock: bool = True,
) -> Tuple[str, Draft]:
    """Generate an AI draft for a campaign+contact pair.

    Enforces plan limits. Meters the draft operation (zero when is_mock=True).
    Subject and body are secured against header/HTML injection.

    Raises:
        ValueError: campaign or contact not found for this tenant.
        RuntimeError: plan limit exceeded.
    """
    # Verify campaign belongs to this tenant.
    camp_result = get_campaign_repository().get(tenant_id, campaign_id)
    if not camp_result:
        raise ValueError(f"campaign_not_found: {campaign_id!r} for tenant {tenant_id!r}")
    _, campaign = camp_result

    # Verify contact belongs to this tenant.
    contact_result = get_contact_repository().get(tenant_id, contact_id)
    if not contact_result:
        raise ValueError(f"contact_not_found: {contact_id!r} for tenant {tenant_id!r}")
    _, contact = contact_result

    # Plan limit.
    draft_repo = get_draft_repository()
    current_drafts = draft_repo.list_by_campaign(tenant_id, campaign_id)
    enforce_seo_limit(tenant_id, LIMIT_OUTREACH_DRAFTS, len(
        draft_repo.list(tenant_id)
    ))

    # Determine next version.
    campaign_drafts = draft_repo.list_by_campaign(tenant_id, campaign_id)
    contact_versions = [d.version for _, d in campaign_drafts if d.contact_id == contact_id]
    next_version = (max(contact_versions) + 1) if contact_versions else 1

    # Build and call LLM.
    prompt = _build_draft_prompt(
        campaign_type=campaign.campaign_type.value if hasattr(campaign.campaign_type, "value") else str(campaign.campaign_type),
        contact_name=contact.name,
        contact_role=contact.role,
        contact_domain=contact.domain,
        client_page=client_page,
        target_site=contact.website or contact.domain,
        evidence=evidence or {},
        brand_tone=brand_tone,
    )
    raw = _call_llm(prompt, is_mock=is_mock)

    subject = _secure_subject(raw.get("subject", ""))
    body = _secure_body(raw.get("body", ""), check_urls=True)

    draft = Draft(
        tenant_id=tenant_id,
        campaign_id=campaign_id,
        contact_id=contact_id,
        subject=subject,
        body=body,
        evidence=evidence or {},
        version=next_version,
        status=DraftStatus.DRAFT,
        approved=False,
        generation_model="mock" if is_mock else "gpt-4o-mini",
    )
    draft_id, saved_draft = draft_repo.create(draft)

    # Meter (zero when is_mock=True or credit system off).
    record_outreach_draft(tenant_id, draft_id=draft_id, is_mock=is_mock)

    return draft_id, saved_draft


def get_draft(tenant_id: str, draft_id: str) -> Optional[Tuple[str, Draft]]:
    return get_draft_repository().get(tenant_id, draft_id)


def edit_draft(
    tenant_id: str,
    draft_id: str,
    *,
    subject: Optional[str] = None,
    body: Optional[str] = None,
    evidence: Optional[Dict] = None,
) -> Optional[Tuple[str, Draft]]:
    """Edit a draft's subject/body/evidence. Applies security checks."""
    fields: Dict = {}
    if subject is not None:
        fields["subject"] = _secure_subject(subject)
    if body is not None:
        fields["body"] = _secure_body(body, check_urls=True)
    if evidence is not None:
        fields["evidence"] = evidence
    if fields:
        fields["status"] = DraftStatus.REVISED
        fields["approved"] = False  # editing resets approval
        fields["approved_by"] = ""
        fields["approved_at"] = ""
    return get_draft_repository().update(tenant_id, draft_id, **fields)


def approve_draft(
    tenant_id: str,
    draft_id: str,
    *,
    approved_by: str,
) -> Optional[Tuple[str, Draft]]:
    """Mark a draft as approved for sending."""
    from seo.stores import _now
    return get_draft_repository().update(
        tenant_id, draft_id,
        status=DraftStatus.APPROVED,
        approved=True,
        approved_by=approved_by,
        approved_at=_now(),
    )


def list_drafts(tenant_id: str, campaign_id: str) -> List[Tuple[str, Draft]]:
    return get_draft_repository().list_by_campaign(tenant_id, campaign_id)


def get_approved_draft(
    tenant_id: str,
    campaign_id: str,
    contact_id: str,
) -> Optional[Tuple[str, Draft]]:
    """Return the most recent approved draft for a campaign+contact pair, or None."""
    drafts = get_draft_repository().list_by_campaign(tenant_id, campaign_id)
    approved = [
        (did, d) for did, d in drafts
        if d.contact_id == contact_id and d.approved and d.status == DraftStatus.APPROVED
    ]
    if not approved:
        return None
    # Highest version wins.
    approved.sort(key=lambda p: p[1].version, reverse=True)
    return approved[0]
