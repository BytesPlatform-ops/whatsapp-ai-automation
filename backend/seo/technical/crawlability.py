from __future__ import annotations

from typing import List

from seo.schemas import Severity

from .models import TechnicalIssue


def _normalize_url(url: str) -> str:
    return (url or "").strip().rstrip("/").lower()


def check_crawlability(
    page: dict,
    *,
    redirects: list = None,
    internal_link_status: list = None,
) -> List[TechnicalIssue]:
    """Deterministic, network-free crawlability checks over supplied data."""
    issues: List[TechnicalIssue] = []
    page = page or {}
    url = page.get("url", "")

    # robots noindex / none
    robots = str(page.get("robots", "")).lower()
    tokens = [t.strip() for t in robots.replace(";", ",").split(",") if t.strip()]
    if "noindex" in tokens or "none" in tokens:
        issues.append(
            TechnicalIssue(
                id="crawl.robots.noindex",
                category="technical",
                severity=Severity.CRITICAL.value,
                title="Page is set to noindex",
                description="The robots directive '%s' prevents this page from being indexed." % robots,
                recommendation="Remove noindex/none from the robots meta tag (or X-Robots-Tag header) if the page should rank.",
                evidence={"robots": robots},
            )
        )

    # canonical conflict
    canonical = page.get("canonical")
    if canonical and _normalize_url(canonical) != _normalize_url(url):
        issues.append(
            TechnicalIssue(
                id="crawl.canonical.conflict",
                category="canonical",
                severity=Severity.MEDIUM.value,
                title="Canonical points to a different URL",
                description="Canonical %s does not match the page URL %s." % (canonical, url),
                recommendation="Point the canonical at this page's own URL unless it is intentionally a duplicate.",
                evidence={"canonical": canonical, "url": url},
            )
        )

    # redirect chain length > 2
    hops = redirects or []
    if len(hops) > 2:
        issues.append(
            TechnicalIssue(
                id="crawl.redirect.chain",
                category="technical",
                severity=Severity.MEDIUM.value,
                title="Long redirect chain",
                description="The URL passes through %d redirect hops before resolving." % len(hops),
                recommendation="Collapse the chain so the original URL redirects directly to the final destination.",
                evidence={"hops": hops, "length": len(hops)},
            )
        )

    # broken internal links
    broken = []
    for item in internal_link_status or []:
        if not isinstance(item, dict):
            continue
        status = item.get("status")
        try:
            if int(status) >= 400:
                broken.append(item)
        except (TypeError, ValueError):
            if isinstance(status, str) and status.strip().lower() == "failed":
                broken.append(item)
    if broken:
        issues.append(
            TechnicalIssue(
                id="crawl.internal_links.broken",
                category="links",
                severity=Severity.HIGH.value,
                title="Broken internal links",
                description="%d internal link(s) return an error status." % len(broken),
                recommendation="Fix or remove the broken internal links so crawlers and users reach valid pages.",
                evidence={"broken": broken, "count": len(broken)},
            )
        )

    return issues
